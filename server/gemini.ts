import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod/v4";
import { HttpError, requireEnv } from "./http";
import type { ChatTurn } from "./llm";

let client: GoogleGenAI | null = null;

function gemini(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return client;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

export function geminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
}

/** Converte erros da API do Gemini em mensagens claras. */
export function mapGeminiError(err: unknown): never {
  if (err instanceof HttpError) throw err;
  if (err instanceof ApiError) {
    console.error("[gemini] erro da API:", err.status, err.message);
    if (err.status === 429) {
      throw new HttpError(503, "O limite de uso do Gemini foi atingido (plano gratuito). Aguarde alguns minutos e tente novamente.", "provider_quota");
    }
    if (err.status === 400 && /api key/i.test(err.message)) {
      throw new HttpError(500, "A chave do Gemini é inválida. Verifique GEMINI_API_KEY no .env.");
    }
    if (err.status === 401 || err.status === 403) {
      throw new HttpError(500, "A chave do Gemini não tem permissão para este recurso. Verifique GEMINI_API_KEY e o modelo configurado.");
    }
    if (err.status === 404) {
      throw new HttpError(500, "Modelo do Gemini não encontrado. Verifique GEMINI_MODEL / GEMINI_IMAGE_MODEL no .env.");
    }
    if (err.status === 400) {
      throw new HttpError(500, "O Gemini recusou a requisição por um problema de configuração.");
    }
    throw new HttpError(503, "O Gemini está instável no momento. Tente novamente em instantes.");
  }
  console.error("[gemini] erro inesperado:", err);
  throw new HttpError(503, "Não foi possível conectar ao Gemini. Tente novamente.");
}

/** Repete a chamada quando o Gemini está temporariamente sobrecarregado (500/503). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const transient = err instanceof ApiError && (err.status === 503 || err.status === 500);
      if (!transient || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

/** Esquema JSON aceito pelo Gemini a partir do esquema Zod. */
export function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

export async function geminiStructured<T extends z.ZodType>(opts: { system: string; user: string; schema: T }): Promise<unknown> {
  let res;
  try {
    res = await withRetry(() =>
      gemini().models.generateContent({
        model: geminiModel(),
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(opts.schema),
          maxOutputTokens: 65536,
        },
      }),
    );
  } catch (err) {
    mapGeminiError(err);
  }

  if (res.promptFeedback?.blockReason) {
    throw new HttpError(422, "A IA não pôde atender a este pedido. Tente descrever a peça de outra forma.", "refusal");
  }
  const finish = res.candidates?.[0]?.finishReason as string | undefined;
  if (finish && BLOCKED.has(finish)) {
    throw new HttpError(422, "A IA não pôde atender a este pedido. Tente descrever a peça de outra forma.", "refusal");
  }
  if (finish === "MAX_TOKENS") {
    throw new HttpError(502, "A receita ficou longa demais para ser gerada de uma vez. Tente uma peça mais simples.", "too_long");
  }
  const text = res.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "A IA retornou uma resposta em formato inesperado. Tente novamente.", "bad_output");
  }
}

export async function* geminiChatStream(system: string, messages: ChatTurn[]): AsyncGenerator<string> {
  let stream;
  try {
    stream = await withRetry(() =>
      gemini().models.generateContentStream({
        model: geminiModel(),
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        config: { systemInstruction: system, maxOutputTokens: 4000 },
      }),
    );
  } catch (err) {
    mapGeminiError(err);
  }
  let produced = false;
  try {
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        produced = true;
        yield text;
      }
    }
  } catch (err) {
    if (!produced) mapGeminiError(err);
    throw err;
  }
  if (!produced) yield "(Não consigo ajudar com esse pedido. Que tal outra dúvida de crochê?)";
}

export async function geminiImage(prompt: string): Promise<{ bytes: Buffer; mimeType: string }> {
  let res;
  try {
    res = await withRetry(() =>
      gemini().models.generateContent({
        model: geminiImageModel(),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "1:1" } },
      }),
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      throw new HttpError(
        503,
        "O limite de imagens do Gemini foi atingido. No plano gratuito a geração de imagens pode não estar disponível; tente mais tarde ou ative o faturamento no Google AI Studio.",
        "provider_quota",
      );
    }
    mapGeminiError(err);
  }
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData?.data);
  if (!image?.inlineData?.data) {
    const finish = res.candidates?.[0]?.finishReason as string | undefined;
    if (res.promptFeedback?.blockReason || (finish && BLOCKED.has(finish))) {
      throw new HttpError(422, "O gerador de imagens recusou esta descrição. Tente gerar novamente.");
    }
    throw new HttpError(502, "O Gemini não retornou uma imagem. Tente novamente.");
  }
  return { bytes: Buffer.from(image.inlineData.data, "base64"), mimeType: image.inlineData.mimeType || "image/png" };
}
