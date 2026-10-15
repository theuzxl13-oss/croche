import { z } from "zod/v4";
import { RecipeContentSchema } from "../shared/recipeSchema";
import { HttpError, readJson, route, sendJson } from "../server/http";
import { consumeRateLimit, IMAGE_BUCKET, loadOwnRecipe, requireUser, supabaseAdmin } from "../server/supabase";
import { generateImage } from "../server/imageGenerator";
import { imagePrompt } from "../server/prompts";

const BodySchema = z.object({ recipeId: z.uuid() });

/**
 * POST /api/generate-image  { recipeId }
 * Gera (ou gera novamente) a imagem ilustrativa da receita, salva no Supabase Storage
 * e retorna uma URL assinada temporária.
 */
export default route(["POST"], async (req, res) => {
  const user = await requireUser(req);
  const body = BodySchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "Receita inválida.");

  const recipe = await loadOwnRecipe(body.data.recipeId, user.id);
  const content = RecipeContentSchema.safeParse(recipe.content);
  if (!content.success) throw new HttpError(422, "O conteúdo desta receita está inválido.");

  await consumeRateLimit(user.id, "image");

  const colors = typeof recipe.options?.colors === "string" ? (recipe.options.colors as string) : null;
  const image = await generateImage(imagePrompt(content.data, colors));
  const ext = image.mimeType.includes("jpeg") ? "jpg" : image.mimeType.includes("webp") ? "webp" : "png";

  const admin = supabaseAdmin();
  const path = `${user.id}/${recipe.id}/${Date.now()}.${ext}`;
  const upload = await admin.storage.from(IMAGE_BUCKET).upload(path, image.bytes, { contentType: image.mimeType, upsert: false });
  if (upload.error) {
    console.error("[generate-image] upload", upload.error);
    throw new HttpError(500, "Não foi possível salvar a imagem gerada.");
  }

  const update = await admin.from("recipes").update({ image_path: path }).eq("id", recipe.id).eq("user_id", user.id);
  if (update.error) {
    await admin.storage.from(IMAGE_BUCKET).remove([path]);
    throw new HttpError(500, "Não foi possível vincular a imagem à receita.");
  }

  // Remove a imagem anterior, se não estiver sendo usada por uma cópia da receita.
  if (recipe.image_path && recipe.image_path !== path) {
    const { count } = await admin
      .from("recipes")
      .select("id", { count: "exact", head: true })
      .eq("image_path", recipe.image_path);
    if (!count) await admin.storage.from(IMAGE_BUCKET).remove([recipe.image_path]);
  }

  const signed = await admin.storage.from(IMAGE_BUCKET).createSignedUrl(path, 60 * 60);
  sendJson(res, 200, { imagePath: path, imageUrl: signed.data?.signedUrl ?? null });
});
