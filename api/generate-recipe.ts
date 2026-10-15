import { GenerationOptionsSchema } from "../shared/recipeSchema";
import { HttpError, readJson, route, sendJson } from "../server/http";
import { consumeRateLimit, requireUser, supabaseAdmin } from "../server/supabase";
import { generateRecipe } from "../server/recipeGenerator";

/**
 * POST /api/generate-recipe
 * Corpo: GenerationOptions. Gera a receita, valida a matemática (com correções automáticas)
 * e salva no histórico do usuário. Retorna { id, validationStatus }.
 */
export default route(["POST"], async (req, res) => {
  const user = await requireUser(req);
  const parsed = GenerationOptionsSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const options = parsed.data;

  await consumeRateLimit(user.id, "recipe");

  const { content, report, correctionRounds } = await generateRecipe(options);

  const { data, error } = await supabaseAdmin()
    .from("recipes")
    .insert({
      user_id: user.id,
      title: content.title.slice(0, 200),
      description: content.summary,
      category: content.category,
      difficulty: content.difficulty,
      prompt: options.description,
      options,
      content,
      validation: report,
      validation_status: report.status,
      correction_rounds: correctionRounds,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[generate-recipe] erro ao salvar", error);
    throw new HttpError(500, "A receita foi gerada, mas não pôde ser salva. Tente novamente.");
  }

  sendJson(res, 201, { id: data.id, validationStatus: report.status, correctionRounds });
});
