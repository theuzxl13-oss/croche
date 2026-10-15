import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { HttpError, requireEnv, envInt, type ApiRequest } from "./http";

export const IMAGE_BUCKET = "recipe-images";

let admin: SupabaseClient | null = null;

/** Cliente com service role: SOMENTE no backend. Sempre filtre por user_id ao usá-lo. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/** Valida o token JWT do Supabase enviado pelo navegador e retorna o usuário. */
export async function requireUser(req: ApiRequest): Promise<User> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Faça login para continuar.", "unauthenticated");
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão expirada. Entre novamente.", "unauthenticated");
  return data.user;
}

export type UsageKind = "recipe" | "image" | "chat";

const LIMITS: Record<UsageKind, { hour: [string, number]; day: [string, number] }> = {
  recipe: { hour: ["RATE_LIMIT_RECIPES_PER_HOUR", 6], day: ["RATE_LIMIT_RECIPES_PER_DAY", 20] },
  image: { hour: ["RATE_LIMIT_IMAGES_PER_HOUR", 10], day: ["RATE_LIMIT_IMAGES_PER_DAY", 30] },
  chat: { hour: ["RATE_LIMIT_CHAT_PER_HOUR", 60], day: ["RATE_LIMIT_CHAT_PER_DAY", 300] },
};

const KIND_LABEL: Record<UsageKind, string> = {
  recipe: "receitas",
  image: "imagens",
  chat: "mensagens ao assistente",
};

/**
 * Registra o uso e bloqueia quando o limite por hora/dia é excedido.
 * O controle é feito no Postgres, então vale entre todas as instâncias serverless.
 */
export async function consumeRateLimit(userId: string, kind: UsageKind): Promise<void> {
  const l = LIMITS[kind];
  const { data, error } = await supabaseAdmin().rpc("consume_rate_limit", {
    p_user_id: userId,
    p_kind: kind,
    p_per_hour: envInt(l.hour[0], l.hour[1]),
    p_per_day: envInt(l.day[0], l.day[1]),
  });
  if (error) {
    console.error("[rate-limit]", error);
    throw new HttpError(500, "Não foi possível verificar o limite de uso. Confira se as migrations foram aplicadas.");
  }
  const result = data as { allowed: boolean; retry_after_seconds: number | null };
  if (!result.allowed) {
    const minutes = Math.max(1, Math.ceil((result.retry_after_seconds ?? 3600) / 60));
    throw new HttpError(429, `Limite de ${KIND_LABEL[kind]} atingido. Tente novamente em cerca de ${minutes} min.`, "rate_limited");
  }
}

export interface RecipeRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  prompt: string;
  options: Record<string, unknown>;
  content: unknown;
  validation: unknown;
  validation_status: string;
  image_path: string | null;
  progress: { currentStep?: number; completed?: string[] } | null;
}

/** Carrega uma receita garantindo que pertence ao usuário. */
export async function loadOwnRecipe(recipeId: string, userId: string): Promise<RecipeRow> {
  const { data, error } = await supabaseAdmin()
    .from("recipes")
    .select("*")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new HttpError(500, "Erro ao carregar a receita.");
  if (!data) throw new HttpError(404, "Receita não encontrada.");
  return data as RecipeRow;
}
