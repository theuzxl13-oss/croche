import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { CATEGORY_LABELS, DIFFICULTY_LABELS, GenerationOptionsSchema } from "../../shared/recipeSchema";
import { heightLabel, recipeToPlainText } from "../../shared/format";
import { generateImage, generateRecipe } from "../lib/api";
import { duplicateRecipe, getRecipe, signedImageUrl, updateRecipe, type RecipeRecord } from "../lib/recipes";
import { downloadRecipePdf } from "../lib/pdf";
import { downloadFromUrl, slugify } from "../lib/files";
import { ErrorBox, PageLoading, Spinner, errorMessage, useToast } from "../components/ui";
import RecipeView from "../components/RecipeView";
import ValidationPanel, { ValidationBadge } from "../components/ValidationPanel";
import GenerationProgress from "../components/GenerationProgress";
import { FloatingChat } from "../components/ChatPanel";

export default function RecipePage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [recipe, setRecipe] = useState<RecipeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const autoImageStarted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await getRecipe(id);
      setRecipe(r);
      if (r?.image_path) setImageUrl(await signedImageUrl(r.image_path));
      else setImageUrl(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    autoImageStarted.current = false;
    void load();
  }, [load]);

  const makeImage = useCallback(async () => {
    setImageBusy(true);
    setImageError(null);
    try {
      const res = await generateImage(id);
      setImageUrl(res.imageUrl);
      setRecipe((r) => (r ? { ...r, image_path: res.imagePath } : r));
    } catch (err) {
      setImageError(errorMessage(err));
    } finally {
      setImageBusy(false);
    }
  }, [id]);

  // Logo após a geração, cria a imagem automaticamente (uma única vez).
  useEffect(() => {
    if (recipe && !recipe.image_path && params.get("nova") === "1" && !autoImageStarted.current) {
      autoImageStarted.current = true;
      setParams({}, { replace: true });
      void makeImage();
    }
  }, [recipe, params, setParams, makeImage]);

  async function run(name: string, fn: () => Promise<void>) {
    setAction(name);
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setAction(null);
    }
  }

  if (loading) return <PageLoading label="Abrindo a receita..." />;
  if (loadError) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox message={loadError} onRetry={load} /></div>;
  if (!recipe) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-3xl">Receita não encontrada</h1>
        <Link className="btn-primary mt-6" to="/minhas-receitas">
          Ver minhas receitas
        </Link>
      </div>
    );
  }

  const c = recipe.content;

  const toggleSaved = () =>
    run("salvar", async () => {
      const updated = await updateRecipe(recipe.id, { is_saved: !recipe.is_saved });
      setRecipe(updated);
      toast(updated.is_saved ? "Receita salva em Minhas Receitas." : "Receita removida das salvas.");
    });

  const toggleFavorite = () =>
    run("favorito", async () => {
      const updated = await updateRecipe(recipe.id, { is_favorite: !recipe.is_favorite });
      setRecipe(updated);
      toast(updated.is_favorite ? "Adicionada às favoritas." : "Removida das favoritas.");
    });

  const pdf = () => run("pdf", () => downloadRecipePdf(c, { imageUrl, status: recipe.validation_status }));

  const copy = () =>
    run("copiar", async () => {
      await navigator.clipboard.writeText(recipeToPlainText(c));
      toast("Receita copiada! Cole onde quiser.");
    });

  const duplicate = () =>
    run("duplicar", async () => {
      const copyRecord = await duplicateRecipe(recipe);
      toast("Cópia criada para você fazer variações.");
      navigate(`/receita/${copyRecord.id}/editar`);
    });

  async function regenerate() {
    const options = GenerationOptionsSchema.safeParse(recipe!.options);
    if (!options.success) {
      toast("Não foi possível recuperar o pedido original desta receita.", "error");
      return;
    }
    if (!window.confirm("Gerar uma nova receita com o mesmo pedido? A receita atual continua guardada no seu histórico.")) return;
    setRegenerating(true);
    try {
      const res = await generateRecipe(options.data);
      navigate(`/receita/${res.id}?nova=1`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRegenerating(false);
    }
  }

  const busy = (name: string) => action === name;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {regenerating && <GenerationProgress />}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Área 1 — Imagem e ficha */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card overflow-hidden">
            <div className="relative aspect-square bg-blush-50">
              {imageUrl ? (
                <img src={imageUrl} alt={`Imagem ilustrativa: ${c.title}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-cocoa-500">
                  {imageBusy ? (
                    <>
                      <Spinner className="h-10 w-10" />
                      <p className="font-bold">Criando a imagem ilustrativa...</p>
                      <p className="text-sm">Isso leva até 1 minuto.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold">Esta receita ainda não tem imagem.</p>
                      <button className="btn-primary no-print" onClick={makeImage}>
                        Gerar imagem
                      </button>
                    </>
                  )}
                </div>
              )}
              {imageBusy && imageUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <Spinner className="h-10 w-10" />
                </div>
              )}
            </div>
            <div className="p-5">
              <h1 className="text-3xl font-semibold">{c.title}</h1>
              <p className="mt-1 text-sm text-cocoa-500">Receita gerada por IA · {CATEGORY_LABELS[c.category]}</p>
              {c.summary && <p className="mt-3 text-cocoa-700">{c.summary}</p>}
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Tamanho", heightLabel(c)],
                  ["Nível", DIFFICULTY_LABELS[c.difficulty]],
                  ["Tempo", c.estimatedTime],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-cream-100 px-2 py-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-lilac-500">{k}</dt>
                    <dd className="mt-0.5 font-bold leading-tight">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3">
                <ValidationBadge status={recipe.validation_status} />
              </div>
              {imageError && (
                <div className="mt-3">
                  <ErrorBox message={imageError} />
                </div>
              )}
              <div className="no-print mt-4 grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={makeImage} disabled={imageBusy}>
                  {imageUrl ? "Gerar nova imagem" : "Gerar imagem"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={!imageUrl || busy("baixar")}
                  onClick={() => run("baixar", () => downloadFromUrl(imageUrl!, `${slugify(c.title)}.png`))}
                >
                  Baixar imagem
                </button>
              </div>
              <p className="mt-3 text-xs text-cocoa-500">A imagem é uma representação ilustrativa e não garante resultado idêntico à receita.</p>
            </div>
          </div>
        </aside>

        {/* Área 2 — Receita */}
        <article className="min-w-0 space-y-6">
          <div className="no-print card flex flex-wrap gap-2 p-3">
            <button className={recipe.is_saved ? "btn-secondary" : "btn-primary"} onClick={toggleSaved} disabled={busy("salvar")}>
              {recipe.is_saved ? "✓ Salva" : "Salvar receita"}
            </button>
            <button className="btn-secondary" onClick={toggleFavorite} disabled={busy("favorito")} aria-pressed={recipe.is_favorite}>
              {recipe.is_favorite ? "★ Favorita" : "☆ Favoritar"}
            </button>
            <button className="btn-secondary" onClick={pdf} disabled={busy("pdf")}>
              {busy("pdf") ? "Gerando PDF..." : "Baixar PDF"}
            </button>
            <button className="btn-secondary" onClick={() => window.print()}>
              Imprimir
            </button>
            <button className="btn-secondary" onClick={copy} disabled={busy("copiar")}>
              Copiar receita
            </button>
            <Link className="btn-secondary" to={`/receita/${recipe.id}/editar`}>
              Editar receita
            </Link>
            <button className="btn-secondary" onClick={duplicate} disabled={busy("duplicar")}>
              Duplicar
            </button>
            <button className="btn-secondary" onClick={regenerate} disabled={regenerating}>
              Gerar novamente
            </button>
            <Link className="btn-primary w-full sm:w-auto" to={`/receita/${recipe.id}/acompanhar`}>
              ▶ Modo acompanhamento
            </Link>
          </div>

          <ValidationPanel report={recipe.validation} correctionRounds={recipe.correction_rounds} />

          <div className="card p-5 sm:p-7">
            <RecipeView content={c} report={recipe.validation} />
          </div>
        </article>
      </div>

      <FloatingChat recipeId={recipe.id} recipeTitle={c.title} />
    </div>
  );
}
