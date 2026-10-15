import type { z } from "zod/v4";
import { HttpError } from "./http";
import { claudeChatStream, generateStructured as claudeStructured, recipeEffort } from "./claude";
import { geminiChatStream, geminiStructured } from "./gemini";

/**
 * Camada de provedor de IA. Escolha com AI_PROVIDER=gemini | anthropic.
 * Sem AI_PROVIDER, usa o Gemini se houver GEMINI_API_KEY; senão, o Claude.
 */
export type TextProvider = "gemini" | "anthropic";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function textProvider(): TextProvider {
  const p = process.env.AI_PROVIDER?.toLowerCase();
  if (p === "gemini" || p === "anthropic") return p;
  return process.env.GEMINI_API_KEY ? "gemini" : "anthropic";
}

/** Gera JSON no formato do esquema e o valida com Zod (o resultado é sempre confiável). */
export async function generateStructured<T extends z.ZodType>(opts: { system: string; user: string; schema: T }): Promise<z.infer<T>> {
  if (textProvider() === "anthropic") {
    return claudeStructured({ ...opts, effort: recipeEffort() });
  }
  const json = await geminiStructured(opts);
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    console.error("[gemini] saída fora do esquema:", parsed.error.issues.slice(0, 5));
    throw new HttpError(502, "A IA retornou uma receita incompleta. Tente novamente.", "bad_output");
  }
  return parsed.data;
}

/** Resposta do chat em pedaços de texto. Erros antes do 1º pedaço chegam como HttpError. */
export function chatStream(system: string, messages: ChatTurn[]): AsyncGenerator<string> {
  return textProvider() === "anthropic" ? claudeChatStream(system, messages) : geminiChatStream(system, messages);
}
