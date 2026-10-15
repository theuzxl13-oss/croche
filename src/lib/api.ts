import type { GenerationOptions } from "../../shared/recipeSchema";
import { requireSupabase } from "./supabase";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await requireSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Faça login para continuar.", 401, "unauthenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function post(path: string, body: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Sem conexão com o servidor. Verifique sua internet e tente novamente.", 0);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    const fallback =
      res.status === 504 ? "A geração demorou mais que o permitido. Tente novamente." : "Algo deu errado. Tente novamente.";
    throw new ApiError(data?.error ?? fallback, res.status, data?.code);
  }
  return res;
}

export async function generateRecipe(options: GenerationOptions): Promise<{ id: string; validationStatus: string; correctionRounds: number }> {
  const res = await post("/api/generate-recipe", options);
  return res.json();
}

export async function generateImage(recipeId: string): Promise<{ imagePath: string; imageUrl: string | null }> {
  const res = await post("/api/generate-image", { recipeId });
  return res.json();
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Envia a conversa e entrega o texto da resposta aos poucos (streaming). */
export async function streamChat(
  recipeId: string | null,
  messages: ChatMessage[],
  onText: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ recipeId, messages }),
      signal,
    });
  } catch (err) {
    if (err instanceof ApiError || (err instanceof DOMException && err.name === "AbortError")) throw err;
    throw new ApiError("Sem conexão com o servidor.", 0);
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(data?.error ?? "O assistente não respondeu. Tente novamente.", res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(decoder.decode(value, { stream: true }));
  }
}
