import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Tolera espaços, aspas e barra final colados por engano nas variáveis da Vercel.
const clean = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "").trim() || undefined;
const url = clean(import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

/** Host do Supabase usado pelo navegador (para mensagens de erro). */
export const supabaseHost = (() => {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return url ?? null;
  }
})();

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Cliente do navegador (chave anônima + RLS). Null quando o projeto ainda não foi configurado. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("O Supabase ainda não foi configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja o README).");
  }
  return supabase;
}

export const IMAGE_BUCKET = "recipe-images";
