import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { flattenSteps } from "../../shared/format";
import { getRecipe, updateRecipe, type RecipeProgress, type RecipeRecord } from "../lib/recipes";
import { ErrorBox, PageLoading, errorMessage } from "../components/ui";
import { FloatingChat } from "../components/ChatPanel";

const localKey = (id: string) => `fioeponto:progresso:${id}`;

export default function FollowPage() {
  const { id = "" } = useParams();
  const [recipe, setRecipe] = useState<RecipeRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RecipeProgress>({ currentStep: 0, completed: [] });
  const [saveState, setSaveState] = useState<"salvo" | "salvando" | "erro">("salvo");
  const [stitches, setStitches] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getRecipe(id)
      .then((r) => {
        setRecipe(r);
        if (!r) return;
        // Usa o progresso mais recente entre o banco e o navegador.
        let local: (RecipeProgress & { savedAt?: number }) | null = null;
        try {
          local = JSON.parse(localStorage.getItem(localKey(id)) ?? "null");
        } catch {
          local = null;
        }
        const remote = r.progress ?? {};
        const useLocal = local && (!r.updated_at || (local.savedAt ?? 0) > Date.parse(r.updated_at));
        const p = useLocal ? local! : remote;
        setProgress({ currentStep: p.currentStep ?? 0, completed: p.completed ?? [] });
        loaded.current = true;
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  const steps = useMemo(() => (recipe ? flattenSteps(recipe.content) : []), [recipe]);
  const current = Math.min(progress.currentStep ?? 0, Math.max(0, steps.length - 1));
  const step = steps[current];
  const completed = useMemo(() => new Set(progress.completed ?? []), [progress.completed]);

  // Salvamento automático (navegador imediatamente; banco com pequeno atraso).
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(localKey(id), JSON.stringify({ ...progress, savedAt: Date.now() }));
    } catch {
      /* armazenamento indisponível */
    }
    setSaveState("salvando");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateRecipe(id, { progress })
        .then(() => setSaveState("salvo"))
        .catch(() => setSaveState("erro"));
    }, 800);
  }, [progress, id]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const go = useCallback(
    (delta: number) => {
      setStitches(0);
      setProgress((p) => ({ ...p, currentStep: Math.min(steps.length - 1, Math.max(0, (p.currentStep ?? 0) + delta)) }));
    },
    [steps.length],
  );

  const toggleDone = useCallback(
    (key: string, advance: boolean) => {
      setProgress((p) => {
        const set = new Set(p.completed ?? []);
        const wasDone = set.has(key);
        if (wasDone) set.delete(key);
        else set.add(key);
        const next = !wasDone && advance ? Math.min(steps.length - 1, (p.currentStep ?? 0) + 1) : p.currentStep;
        return { currentStep: next, completed: [...set] };
      });
      if (advance) setStitches(0);
    },
    [steps.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox message={error} /></div>;
  if (!recipe) return <PageLoading label="Abrindo o modo acompanhamento..." />;
  if (!step) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox message="Esta receita não tem carreiras para acompanhar." /></div>;

  const partSteps = steps.filter((s) => s.partIndex === step.partIndex);
  const partPos = partSteps.findIndex((s) => s.key === step.key) + 1;
  const totalDone = steps.filter((s) => completed.has(s.key)).length;
  const pct = Math.round((totalDone / steps.length) * 100);
  const parts = recipe.content.parts.map((p, i) => {
    const ps = steps.filter((s) => s.partIndex === i);
    return { name: p.name, quantity: p.quantity, total: ps.length, done: ps.filter((s) => completed.has(s.key)).length, first: steps.indexOf(ps[0]) };
  });
  const isDone = completed.has(step.key);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/receita/${id}`} className="btn-ghost -ml-3">
          ← Voltar à receita
        </Link>
        <span className="text-sm text-cocoa-500" aria-live="polite">
          {saveState === "salvando" ? "Salvando progresso..." : saveState === "erro" ? "Sem conexão — progresso guardado neste aparelho" : "Progresso salvo ✓"}
        </span>
      </div>

      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{recipe.content.title}</h1>

      <div className="mt-4">
        <div className="flex justify-between text-sm font-bold text-cocoa-700">
          <span>
            {totalDone} de {steps.length} carreiras concluídas
          </span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-3 overflow-hidden rounded-full bg-cream-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-blush-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <section className={`card mt-6 p-6 sm:p-8 ${isDone ? "border-emerald-300 bg-emerald-50/40" : ""}`} aria-live="polite">
        <p className="text-sm font-bold uppercase tracking-wide text-lilac-500">
          {step.partName}
          {step.partQuantity > 1 ? ` (faça ${step.partQuantity})` : ""} · carreira {partPos} de {partSteps.length}
        </p>
        <h2 className="mt-1 font-display text-5xl font-semibold text-blush-600 sm:text-6xl">{step.roundNumber}ª carreira</h2>
        <p className="mt-4 text-2xl leading-snug sm:text-3xl">{step.text}</p>
        <p className="mt-3 text-xl">
          Total: <strong>{step.count} pontos</strong>
        </p>
        {step.note && <p className="mt-3 rounded-2xl bg-lilac-50 px-4 py-3 text-lg text-lilac-700">↳ {step.note}</p>}

        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-cream-100 p-3">
          <span className="text-sm font-bold text-cocoa-700">Contador de pontos:</span>
          <button className="btn-secondary min-h-12 w-12 px-0" onClick={() => setStitches((s) => Math.max(0, s - 1))} aria-label="Diminuir contador">
            −
          </button>
          <span className="min-w-16 text-center text-2xl font-bold" aria-live="polite">
            {stitches}
            <span className="text-base text-cocoa-500">/{step.count}</span>
          </span>
          <button className="btn-primary min-h-12 w-12 px-0" onClick={() => setStitches((s) => s + 1)} aria-label="Aumentar contador">
            +
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="btn-secondary py-4 text-lg" onClick={() => go(-1)} disabled={current === 0}>
            ← Anterior
          </button>
          <button className="btn-secondary py-4 text-lg" onClick={() => go(1)} disabled={current === steps.length - 1}>
            Próxima →
          </button>
          <button className={`col-span-2 py-4 text-lg ${isDone ? "btn-secondary" : "btn-primary"}`} onClick={() => toggleDone(step.key, !isDone)}>
            {isDone ? "✓ Concluída (desmarcar)" : "Concluí esta carreira → próxima"}
          </button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Peças</h2>
        <ul className="space-y-2">
          {parts.map((p, i) => (
            <li key={i}>
              <button
                className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left ${
                  i === step.partIndex ? "border-blush-300 bg-blush-50" : "border-cream-200 bg-white"
                }`}
                onClick={() => setProgress((pr) => ({ ...pr, currentStep: p.first }))}
              >
                <span className="font-bold">
                  {p.done === p.total ? "✓ " : ""}
                  {p.name}
                  {p.quantity > 1 ? ` (x${p.quantity})` : ""}
                </span>
                <span className="text-sm text-cocoa-500">
                  {p.done}/{p.total}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-cocoa-500">Dica: no computador, use as setas ← → do teclado para trocar de carreira.</p>
      </section>

      <FloatingChat recipeId={recipe.id} recipeTitle={recipe.content.title} />
    </div>
  );
}
