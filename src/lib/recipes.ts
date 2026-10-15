import type { Category, Difficulty, GenerationOptions, RecipeContent } from "../../shared/recipeSchema";
import { validateRecipe, type ValidationReport, type ValidationStatus } from "../../shared/crochet/validator";
import { IMAGE_BUCKET, requireSupabase } from "./supabase";

export interface RecipeProgress {
  currentStep?: number;
  completed?: string[];
}

export interface RecipeRecord {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  prompt: string;
  options: Partial<GenerationOptions>;
  content: RecipeContent;
  validation: ValidationReport;
  validation_status: ValidationStatus;
  correction_rounds: number;
  image_path: string | null;
  is_saved: boolean;
  is_favorite: boolean;
  progress: RecipeProgress;
  duplicated_from: string | null;
  created_at: string;
  updated_at: string;
}

export type RecipeSummary = Pick<
  RecipeRecord,
  "id" | "title" | "description" | "category" | "difficulty" | "image_path" | "is_saved" | "is_favorite" | "validation_status" | "created_at" | "updated_at"
>;

const SUMMARY_COLUMNS =
  "id,title,description,category,difficulty,image_path,is_saved,is_favorite,validation_status,created_at,updated_at";

function fail(message: string, error: unknown): never {
  console.error(message, error);
  throw new Error(message);
}

export async function getRecipe(id: string): Promise<RecipeRecord | null> {
  const { data, error } = await requireSupabase().from("recipes").select("*").eq("id", id).maybeSingle();
  if (error) fail("Não foi possível carregar a receita.", error);
  return data as RecipeRecord | null;
}

export interface ListFilters {
  search?: string;
  category?: Category | "todas";
  view?: "todas" | "salvas" | "favoritas";
}

export async function listRecipes(filters: ListFilters = {}): Promise<RecipeSummary[]> {
  let q = requireSupabase().from("recipes").select(SUMMARY_COLUMNS).order("created_at", { ascending: false }).limit(200);
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%_,()]/g, " ");
    q = q.ilike("title", `%${term}%`);
  }
  if (filters.category && filters.category !== "todas") q = q.eq("category", filters.category);
  if (filters.view === "salvas") q = q.eq("is_saved", true);
  if (filters.view === "favoritas") q = q.eq("is_favorite", true);
  const { data, error } = await q;
  if (error) fail("Não foi possível carregar suas receitas.", error);
  return (data ?? []) as RecipeSummary[];
}

export async function updateRecipe(id: string, patch: Partial<Omit<RecipeRecord, "id" | "user_id" | "created_at">>): Promise<RecipeRecord> {
  const { data, error } = await requireSupabase().from("recipes").update(patch).eq("id", id).select("*").single();
  if (error) fail("Não foi possível salvar as alterações.", error);
  return data as RecipeRecord;
}

/** Salva o conteúdo editado, sempre revalidando a matemática antes. */
export async function saveEditedContent(id: string, content: RecipeContent): Promise<RecipeRecord> {
  const report = validateRecipe(content);
  return updateRecipe(id, {
    content,
    title: content.title.slice(0, 200) || "Receita sem título",
    description: content.summary,
    category: content.category,
    difficulty: content.difficulty,
    validation: report,
    validation_status: report.status,
  });
}

export async function duplicateRecipe(source: RecipeRecord): Promise<RecipeRecord> {
  const sb = requireSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Faça login para continuar.");
  const content = { ...source.content, title: `${source.content.title} (variação)` };
  const { data, error } = await sb
    .from("recipes")
    .insert({
      user_id: auth.user.id,
      title: content.title.slice(0, 200),
      description: source.description,
      category: source.category,
      difficulty: source.difficulty,
      prompt: source.prompt,
      options: source.options,
      content,
      validation: source.validation,
      validation_status: source.validation_status,
      correction_rounds: source.correction_rounds,
      image_path: source.image_path,
      is_saved: true,
      duplicated_from: source.id,
    })
    .select("*")
    .single();
  if (error) fail("Não foi possível duplicar a receita.", error);
  return data as RecipeRecord;
}

export async function deleteRecipe(id: string, imagePath: string | null): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("recipes").delete().eq("id", id);
  if (error) fail("Não foi possível excluir a receita.", error);
  if (imagePath) {
    // A imagem pode ser compartilhada com uma cópia; só apaga se ninguém mais usa.
    const { count } = await sb.from("recipes").select("id", { count: "exact", head: true }).eq("image_path", imagePath);
    if (!count) await sb.storage.from(IMAGE_BUCKET).remove([imagePath]);
  }
}

export async function signedImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await requireSupabase().storage.from(IMAGE_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function signedImageUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await requireSupabase().storage.from(IMAGE_BUCKET).createSignedUrls(unique, 60 * 60);
  const map: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  return map;
}
