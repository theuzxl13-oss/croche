import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, DIFFICULTY_LABELS, type Category } from "../../shared/recipeSchema";
import {
  deleteRecipe,
  duplicateRecipe,
  getRecipe,
  listRecipes,
  signedImageUrl,
  signedImageUrls,
  updateRecipe,
  type ListFilters,
  type RecipeSummary,
} from "../lib/recipes";
import { downloadRecipePdf } from "../lib/pdf";
import { EmptyState, ErrorBox, PageLoading, errorMessage, useToast } from "../components/ui";
import { ValidationBadge } from "../components/ValidationPanel";

const VIEWS: [NonNullable<ListFilters["view"]>, string][] = [
  ["todas", "Histórico completo"],
  ["salvas", "Salvas"],
  ["favoritas", "Favoritas"],
];

function RecipeCard({
  r,
  imageUrl,
  onChange,
  onRemoved,
}: {
  r: RecipeSummary;
  imageUrl?: string;
  onChange: (r: RecipeSummary) => void;
  onRemoved: (id: string) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(r.description);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="card flex flex-col overflow-hidden">
      <Link to={`/receita/${r.id}`} className="block aspect-[4/3] bg-blush-50">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-cocoa-500">Sem imagem</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/receita/${r.id}`} className="font-display text-lg font-semibold leading-tight hover:text-blush-600">
            {r.title}
          </Link>
          <button
            className="text-2xl leading-none text-blush-500"
            aria-label={r.is_favorite ? "Remover das favoritas" : "Favoritar"}
            aria-pressed={r.is_favorite}
            disabled={busy === "fav"}
            onClick={() =>
              run("fav", async () => {
                const u = await updateRecipe(r.id, { is_favorite: !r.is_favorite });
                onChange({ ...r, is_favorite: u.is_favorite });
              })
            }
          >
            {r.is_favorite ? "★" : "☆"}
          </button>
        </div>
        <p className="mt-1 text-sm text-cocoa-500">
          {CATEGORY_LABELS[r.category]} · {DIFFICULTY_LABELS[r.difficulty]} · {new Date(r.created_at).toLocaleDateString("pt-BR")}
          {r.is_saved ? " · Salva" : ""}
        </p>
        <div className="mt-2">
          <ValidationBadge status={r.validation_status} className="text-xs" />
        </div>

        {editing ? (
          <div className="mt-3">
            <label className="label" htmlFor={`desc-${r.id}`}>
              Descrição
            </label>
            <textarea id={`desc-${r.id}`} className="input min-h-20 text-sm" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <button
                className="btn-primary min-h-10 text-sm"
                disabled={busy === "desc"}
                onClick={() =>
                  run("desc", async () => {
                    await updateRecipe(r.id, { description });
                    onChange({ ...r, description });
                    setEditing(false);
                    toast("Descrição atualizada.");
                  })
                }
              >
                Salvar
              </button>
              <button className="btn-ghost min-h-10 text-sm" onClick={() => { setDescription(r.description); setEditing(false); }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 line-clamp-3 flex-1 text-sm text-cocoa-700">{r.description || "Sem descrição."}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Link to={`/receita/${r.id}`} className="btn-primary min-h-10 px-4 text-sm">
            Abrir
          </Link>
          <button className="btn-secondary min-h-10 px-3 text-sm" onClick={() => setEditing(true)} disabled={editing}>
            Editar descrição
          </button>
          <button
            className="btn-secondary min-h-10 px-3 text-sm"
            disabled={busy === "pdf"}
            onClick={() =>
              run("pdf", async () => {
                const full = await getRecipe(r.id);
                if (!full) throw new Error("Receita não encontrada.");
                await downloadRecipePdf(full.content, { imageUrl: await signedImageUrl(full.image_path), status: full.validation_status });
              })
            }
          >
            {busy === "pdf" ? "Gerando..." : "PDF"}
          </button>
          <button
            className="btn-secondary min-h-10 px-3 text-sm"
            disabled={busy === "dup"}
            onClick={() =>
              run("dup", async () => {
                const full = await getRecipe(r.id);
                if (!full) throw new Error("Receita não encontrada.");
                const copy = await duplicateRecipe(full);
                toast("Cópia criada.");
                navigate(`/receita/${copy.id}/editar`);
              })
            }
          >
            Duplicar
          </button>
          <button
            className="btn-danger min-h-10 px-3 text-sm"
            disabled={busy === "del"}
            onClick={() => {
              if (!window.confirm(`Excluir "${r.title}"? Esta ação não pode ser desfeita.`)) return;
              void run("del", async () => {
                await deleteRecipe(r.id, r.image_path);
                onRemoved(r.id);
                toast("Receita excluída.");
              });
            }}
          >
            Excluir
          </button>
        </div>
      </div>
    </li>
  );
}

export default function LibraryPage() {
  const [items, setItems] = useState<RecipeSummary[] | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "todas">("todas");
  const [view, setView] = useState<NonNullable<ListFilters["view"]>>("todas");

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await listRecipes({ search, category, view });
      setItems(list);
      setImages(await signedImageUrls(list.map((r) => r.image_path ?? "").filter(Boolean)));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [search, category, view]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Minhas Receitas</h1>
          <p className="mt-1 text-cocoa-700">Tudo o que você já gerou fica guardado aqui.</p>
        </div>
        <Link to="/" className="btn-primary">
          + Nova receita
        </Link>
      </div>

      <div className="card mt-6 space-y-4 p-4">
        <div className="flex flex-wrap gap-2" role="tablist">
          {VIEWS.map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? "chip-on" : "chip-off"} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <div>
            <label htmlFor="busca" className="sr-only">
              Pesquisar pelo nome
            </label>
            <input id="busca" type="search" className="input" placeholder="Pesquisar pelo nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label htmlFor="categoria" className="sr-only">
              Categoria
            </label>
            <select id="categoria" className="input" value={category} onChange={(e) => setCategory(e.target.value as Category | "todas")}>
              <option value="todas">Todas as categorias</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : items === null ? (
          <PageLoading label="Buscando suas receitas..." />
        ) : items.length === 0 ? (
          search || category !== "todas" || view !== "todas" ? (
            <EmptyState title="Nada encontrado" text="Nenhuma receita corresponde aos filtros escolhidos." />
          ) : (
            <EmptyState title="Sua biblioteca está vazia" text="Gere sua primeira receita e ela aparecerá aqui." action={{ to: "/", label: "Criar minha primeira receita" }} />
          )
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => (
              <RecipeCard
                key={r.id}
                r={r}
                imageUrl={r.image_path ? images[r.image_path] : undefined}
                onChange={(u) => setItems((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null)}
                onRemoved={(id) => setItems((list) => list?.filter((x) => x.id !== id) ?? null)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
