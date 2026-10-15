import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";
import { HttpError, requireEnv } from "./http";
import type { ChatTurn } from "./llm";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function recipeEffort(): Effort {
  const e = process.env.ANTHROPIC_RECIPE_EFFORT as Effort | undefined;
  return e && ["low", "medium", "high", "xhigh", "max"].includes(e) ? e : "high";
}

/** Converte erros da API em mensagens claras para o usuário. */
export function mapAnthropicError(err: unknown): never {
  if (err instanceof HttpError) throw err;
  if (err instanceof Anthropic.RateLimitError) {
    throw new HttpError(503, "O serviço de IA está muito requisitado agora. Aguarde um minuto e tente novamente.");
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    throw new HttpError(500, "A chave da API de IA é inválida ou não tem permissão. Verifique ANTHROPIC_API_KEY.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[claude] requisição inválida:", err.message);
    throw new HttpError(500, "A IA recusou a requisição por um problema de configuração. Verifique o modelo configurado.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    throw new HttpError(503, "Não foi possível conectar ao serviço de IA. Tente novamente.");
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[claude] erro da API:", err.status, err.message);
    throw new HttpError(503, "O serviço de IA está instável no momento. Tente novamente em instantes.");
  }
  throw err;
}

/**
 * Chama o Claude exigindo uma saída JSON no formato do esquema Zod informado.
 * Usa streaming (respostas longas) e fallback automático do servidor em caso de recusa.
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: T;
  effort: Effort;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = anthropic().beta.messages.stream({
      model: claudeModel(),
      max_tokens: opts.maxTokens ?? 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    message = await stream.finalMessage();
  } catch (err) {
    mapAnthropicError(err);
  }

  if (message.stop_reason === "refusal") {
    throw new HttpError(422, "A IA não pôde atender a este pedido. Tente descrever a peça de outra forma.", "refusal");
  }
  if (message.stop_reason === "max_tokens") {
    throw new HttpError(502, "A receita ficou longa demais para ser gerada de uma vez. Tente uma peça mais simples.", "too_long");
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError(502, "A IA retornou uma resposta em formato inesperado. Tente novamente.", "bad_output");
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    console.error("[claude] saída fora do esquema:", parsed.error.issues.slice(0, 5));
    throw new HttpError(502, "A IA retornou uma receita incompleta. Tente novamente.", "bad_output");
  }
  return parsed.data;
}

/** Chat em streaming com o Claude. */
export async function* claudeChatStream(system: string, messages: ChatTurn[]): AsyncGenerator<string> {
  let produced = false;
  try {
    const stream = anthropic().messages.stream({
      model: claudeModel(),
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system,
      messages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        produced = true;
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\n(Não consigo ajudar com esse pedido. Que tal outra dúvida de crochê?)";
  } catch (err) {
    if (!produced) mapAnthropicError(err);
    throw err;
  }
}
