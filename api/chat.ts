import { z } from "zod/v4";
import { RecipeContentSchema } from "../shared/recipeSchema";
import { flattenSteps, recipeToPlainText } from "../shared/format";
import { HttpError, readJson, route } from "../server/http";
import { consumeRateLimit, loadOwnRecipe, requireUser } from "../server/supabase";
import { chatStream } from "../server/llm";
import { chatSystemPrompt } from "../server/prompts";

const BodySchema = z.object({
  recipeId: z.uuid().nullable(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40),
});

/**
 * POST /api/chat  { recipeId, messages }
 * Responde em streaming (text/plain). Quando há receita, o contexto é carregado do banco
 * (nunca confiamos em uma receita enviada pelo navegador).
 */
export default route(["POST"], async (req, res) => {
  const user = await requireUser(req);
  const body = BodySchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "Mensagem inválida.");
  const { recipeId, messages } = body.data;

  if (messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    throw new HttpError(400, "A conversa deve começar e terminar com uma mensagem sua.");
  }
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) throw new HttpError(400, "Sequência de mensagens inválida.");
  }

  let recipeText: string | null = null;
  let progressLine: string | null = null;
  if (recipeId) {
    const recipe = await loadOwnRecipe(recipeId, user.id);
    const content = RecipeContentSchema.safeParse(recipe.content);
    if (content.success) {
      recipeText = recipeToPlainText(content.data);
      const idx = recipe.progress?.currentStep;
      const steps = flattenSteps(content.data);
      if (typeof idx === "number" && steps[idx]) {
        const s = steps[idx];
        progressLine = `está na ${s.roundNumber}ª carreira da peça "${s.partName}" (${s.text}, total ${s.count} pontos).`;
      }
    }
  }

  await consumeRateLimit(user.id, "chat");

  let started = false;
  const write = (text: string) => {
    if (!started) {
      started = true;
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Accel-Buffering", "no");
    }
    res.write(text);
  };

  try {
    for await (const text of chatStream(chatSystemPrompt(recipeText, progressLine), messages)) write(text);
  } catch (err) {
    // Antes do primeiro trecho ainda dá para responder com um erro JSON adequado.
    if (!started) throw err;
    console.error("[chat] erro no streaming", err);
    write("\n\n(A resposta foi interrompida. Tente enviar novamente.)");
  }
  if (!started) write("");
  res.end();
});
