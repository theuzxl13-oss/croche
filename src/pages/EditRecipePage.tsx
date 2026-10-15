import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  RecipeContentSchema,
  START_TYPES,
  type Part,
  type RecipeContent,
  type Round,
} from "../../shared/recipeSchema";
import { validateRecipe } from "../../shared/crochet/validator";
import { getRecipe, saveEditedContent } from "../lib/recipes";
import { ErrorBox, PageLoading, errorMessage, useToast } from "../components/ui";
import ValidationPanel from "../components/ValidationPanel";

const START_LABELS: Record<(typeof START_TYPES)[number], string> = {
  anel_magico: "Anel mágico",
  correntinha_plana: "Correntinha (peça plana)",
  correntinha_oval: "Correntinha (início oval)",
  correntinha_circular: "Correntinha fechada em círculo",
  continua: "Continua de outra peça",
};

const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);

function LinesField({ id, label, value, onChange, hint }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        className="input min-h-28"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
      />
      <p className="mt-1 text-xs text-cocoa-500">{hint ?? "Um item por linha."}</p>
    </div>
  );
}

function RoundRow({ round, onChange, onRemove, status }: { round: Round; onChange: (r: Round) => void; onRemove: () => void; status?: string }) {
  return (
    <div className={`grid grid-cols-[4rem_4rem_1fr] gap-2 rounded-2xl p-2 sm:grid-cols-[4rem_4rem_1fr_5rem_7rem_auto] ${status === "error" ? "bg-red-50" : status === "warning" ? "bg-amber-50" : "bg-white"}`}>
      <input aria-label="Da carreira" type="number" min={1} className="input px-2" value={round.from} onChange={(e) => onChange({ ...round, from: Number(e.target.value) })} />
      <input aria-label="Até a carreira" type="number" min={1} className="input px-2" value={round.to} onChange={(e) => onChange({ ...round, to: Number(e.target.value) })} />
      <input aria-label="Instrução" className="input" value={round.text} onChange={(e) => onChange({ ...round, text: e.target.value })} />
      <input aria-label="Total de pontos" type="number" min={1} className="input px-2" value={round.count} onChange={(e) => onChange({ ...round, count: Number(e.target.value) })} />
      <select aria-label="Tipo de carreira" className="input px-2" value={round.kind} onChange={(e) => onChange({ ...round, kind: e.target.value as Round["kind"] })}>
        <option value="normal">Normal</option>
        <option value="especial">Especial</option>
      </select>
      <button className="btn-ghost min-h-10 px-3 text-red-700" onClick={onRemove} aria-label="Remover carreira">
        ✕
      </button>
      <input
        aria-label="Observação"
        className="input col-span-3 text-sm sm:col-span-6"
        placeholder="Observação (troca de cor, enchimento...)"
        value={round.note ?? ""}
        onChange={(e) => onChange({ ...round, note: e.target.value || null })}
      />
    </div>
  );
}

export default function EditRecipePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [content, setContent] = useState<RecipeContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRecipe(id)
      .then((r) => (r ? setContent(structuredClone(r.content)) : setError("Receita não encontrada.")))
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  const report = useMemo(() => (content ? validateRecipe(content) : null), [content]);

  if (error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox message={error} /></div>;
  if (!content || !report) return <PageLoading />;

  const set = <K extends keyof RecipeContent>(k: K, v: RecipeContent[K]) => setContent((c) => (c ? { ...c, [k]: v } : c));
  const setPart = (i: number, p: Part) => set("parts", content.parts.map((x, j) => (j === i ? p : x)));
  const roundStatus = (pi: number, from: number) => report.parts.find((p) => p.partIndex === pi)?.rounds.find((r) => r.from === from)?.status;

  async function save() {
    const parsed = RecipeContentSchema.safeParse(content);
    if (!parsed.success) {
      toast("Há campos inválidos. Confira números e textos.", "error");
      return;
    }
    if (report!.status === "com_erros" && !window.confirm("A receita ainda tem erros de contagem e será marcada como NÃO validada. Salvar mesmo assim?")) return;
    setSaving(true);
    try {
      await saveEditedContent(id, parsed.data);
      toast("Alterações salvas.");
      navigate(`/receita/${id}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Editar receita</h1>
        <div className="flex gap-2">
          <Link to={`/receita/${id}`} className="btn-ghost">
            Cancelar
          </Link>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      <div className="mt-4 lg:sticky lg:top-20 lg:z-20">
        <ValidationPanel report={report} />
      </div>

      <section className="card mt-6 space-y-4 p-5">
        <h2 className="section-title">Informações gerais</h2>
        <div>
          <label htmlFor="titulo" className="label">Nome da peça</label>
          <input id="titulo" className="input" value={content.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label htmlFor="resumo" className="label">Descrição</label>
          <textarea id="resumo" className="input min-h-20" value={content.summary} onChange={(e) => set("summary", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cat" className="label">Categoria</label>
            <select id="cat" className="input" value={content.category} onChange={(e) => set("category", e.target.value as RecipeContent["category"])}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="nivel" className="label">Nível</label>
            <select id="nivel" className="input" value={content.difficulty} onChange={(e) => set("difficulty", e.target.value as RecipeContent["difficulty"])}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="altura" className="label">Altura aproximada (cm)</label>
            <input id="altura" type="number" min={0} step={0.5} className="input" value={content.heightCm ?? ""} onChange={(e) => set("heightCm", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div>
            <label htmlFor="tempo" className="label">Tempo estimado</label>
            <input id="tempo" className="input" value={content.estimatedTime} onChange={(e) => set("estimatedTime", e.target.value)} />
          </div>
          <div>
            <label htmlFor="agulha" className="label">Agulha (mm)</label>
            <input id="agulha" type="number" min={0.5} step={0.25} className="input" value={content.hook.sizeMm} onChange={(e) => set("hook", { ...content.hook, sizeMm: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="fio" className="label">Fio</label>
            <input id="fio" className="input" value={content.yarn.type} onChange={(e) => set("yarn", { ...content.yarn, type: e.target.value })} />
          </div>
        </div>
        <LinesField id="materiais" label="Outros materiais" value={content.materials} onChange={(v) => set("materials", v)} />
        <LinesField
          id="abrev"
          label="Abreviações"
          hint='Uma por linha, no formato "pb - ponto baixo".'
          value={content.abbreviations.map((a) => `${a.abbr} - ${a.meaning}`)}
          onChange={(v) =>
            set(
              "abbreviations",
              v.map((l) => {
                const [abbr, ...rest] = l.split(/\s+[-—–]\s+/);
                return { abbr: abbr.trim(), meaning: rest.join(" - ").trim() };
              }),
            )
          }
        />
      </section>

      {content.parts.map((part, pi) => (
        <section key={pi} className="card mt-6 space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title mb-0">Peça {pi + 1}</h2>
            <button
              className="btn-danger min-h-10 text-sm"
              onClick={() => window.confirm(`Remover a peça "${part.name}"?`) && set("parts", content.parts.filter((_, j) => j !== pi))}
            >
              Remover peça
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <input aria-label="Nome da peça" className="input sm:col-span-2" value={part.name} onChange={(e) => setPart(pi, { ...part, name: e.target.value })} />
            <input aria-label="Cor" className="input" placeholder="Cor" value={part.color} onChange={(e) => setPart(pi, { ...part, color: e.target.value })} />
            <input aria-label="Quantidade" type="number" min={1} className="input" value={part.quantity} onChange={(e) => setPart(pi, { ...part, quantity: Number(e.target.value) || 1 })} />
            <select aria-label="Tipo de início" className="input sm:col-span-2" value={part.start.type} onChange={(e) => setPart(pi, { ...part, start: { ...part.start, type: e.target.value as Part["start"]["type"] } })}>
              {START_TYPES.map((s) => <option key={s} value={s}>{START_LABELS[s]}</option>)}
            </select>
            {part.start.type.startsWith("correntinha") && (
              <input aria-label="Número de correntinhas" type="number" min={2} className="input" placeholder="Correntinhas" value={part.start.chains ?? ""} onChange={(e) => setPart(pi, { ...part, start: { ...part.start, chains: e.target.value ? Number(e.target.value) : null } })} />
            )}
          </div>
          <p className="text-xs text-cocoa-500">Colunas: da carreira · até a carreira · instrução · total de pontos · tipo.</p>
          <div className="space-y-2">
            {part.rounds.map((r, ri) => (
              <RoundRow
                key={ri}
                round={r}
                status={roundStatus(pi, r.from)}
                onChange={(nr) => setPart(pi, { ...part, rounds: part.rounds.map((x, j) => (j === ri ? nr : x)) })}
                onRemove={() => setPart(pi, { ...part, rounds: part.rounds.filter((_, j) => j !== ri) })}
              />
            ))}
          </div>
          <button
            className="btn-secondary min-h-10 text-sm"
            onClick={() => {
              const last = part.rounds[part.rounds.length - 1];
              const n = last ? last.to + 1 : 1;
              setPart(pi, { ...part, rounds: [...part.rounds, { from: n, to: n, text: "", count: last?.count ?? 6, kind: "normal", note: null }] });
            }}
          >
            + Adicionar carreira
          </button>
          <div>
            <label className="label" htmlFor={`acab-${pi}`}>Fechamento e arremate</label>
            <textarea id={`acab-${pi}`} className="input min-h-16" value={part.finishing} onChange={(e) => setPart(pi, { ...part, finishing: e.target.value })} />
          </div>
        </section>
      ))}

      <button
        className="btn-secondary mt-4"
        onClick={() =>
          set("parts", [
            ...content.parts,
            { name: "Nova peça", quantity: 1, color: "", start: { type: "anel_magico", chains: null }, rounds: [{ from: 1, to: 1, text: "6 pb no anel mágico", count: 6, kind: "normal", note: null }], finishing: "" },
          ])
        }
      >
        + Adicionar peça
      </button>

      <section className="card mt-6 space-y-4 p-5">
        <h2 className="section-title">Montagem, acabamento e dicas</h2>
        <LinesField id="montagem" label="Montagem (um passo por linha)" value={content.assembly} onChange={(v) => set("assembly", v)} />
        <LinesField id="acabamento" label="Acabamento" value={content.finishing} onChange={(v) => set("finishing", v)} />
        <LinesField id="dicas" label="Dicas" value={content.tips} onChange={(v) => set("tips", v)} />
      </section>

      <div className="mt-6 flex justify-end gap-2">
        <Link to={`/receita/${id}`} className="btn-ghost">Cancelar</Link>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}
