import { HttpError, requireEnv } from "./http";
import { geminiImage } from "./gemini";

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Provedor de imagens: IMAGE_PROVIDER=gemini | openai.
 * Sem IMAGE_PROVIDER, usa o Gemini se houver GEMINI_API_KEY; senão, a OpenAI.
 */
export function imageProvider(): "gemini" | "openai" {
  const p = process.env.IMAGE_PROVIDER?.toLowerCase();
  if (p === "gemini" || p === "openai") return p;
  return process.env.GEMINI_API_KEY ? "gemini" : "openai";
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  return imageProvider() === "gemini" ? geminiImage(prompt) : { bytes: await generateOpenAIPng(prompt), mimeType: "image/png" };
}

interface OpenAIImageResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string; code?: string };
}

/** Gera uma imagem PNG (1024x1024) com a API de imagens da OpenAI e retorna os bytes. */
async function generateOpenAIPng(prompt: string): Promise<Buffer> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const quality = process.env.OPENAI_IMAGE_QUALITY || "medium";

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size: "1024x1024", quality, n: 1 }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    throw new HttpError(503, "Não foi possível conectar ao serviço de imagens. Tente novamente.");
  }

  const body = (await res.json().catch(() => ({}))) as OpenAIImageResponse;
  if (!res.ok) {
    console.error("[image] erro", res.status, body.error);
    if (res.status === 400 && body.error?.code === "moderation_blocked") {
      throw new HttpError(422, "O gerador de imagens recusou esta descrição. Tente gerar novamente ou ajuste o pedido.");
    }
    if (res.status === 401) throw new HttpError(500, "A chave da API de imagens é inválida. Verifique OPENAI_API_KEY.");
    if (res.status === 429) throw new HttpError(503, "O gerador de imagens está muito requisitado. Tente em instantes.");
    throw new HttpError(502, "Falha ao gerar a imagem. Tente novamente.");
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(502, "O gerador de imagens não retornou uma imagem.");
  return Buffer.from(b64, "base64");
}
