import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  GenerationOptionsSchema,
  SIZE_LABELS,
  YARN_LABELS,
  type GenerationOptions,
} from "../../shared/recipeSchema";
import { useAuth } from "../hooks/useAuth";
import { generateRecipe } from "../lib/api";
import { ErrorBox, YarnBall, errorMessage } from "../components/ui";
import GenerationProgress from "../components/GenerationProgress";

const DRAFT_KEY = "fioeponto:rascunho";

const EXAMPLES = [
  { emoji: "🐰", title: "Coelhinha com laço", text: "Uma coelhinha branca de amigurumi com orelhas compridas, olhos azuis e laço lilás, com aproximadamente 16 cm de altura." },
  { emoji: "🧸", title: "Ursinho clássico", text: "Ursinho de crochê marrom-claro com focinho bege e gravatinha vermelha, cerca de 20 cm." },
  { emoji: "👗", title: "Boneca de vestido azul", text: "Boneca de amigurumi com cabelo castanho em tranças e vestido azul-claro com babado, 25 cm." },
  { emoji: "🌻", title: "Girassol", text: "Girassol de crochê com miolo marrom, pétalas amarelas e cabo verde com duas folhas." },
  { emoji: "🐶", title: "Cachorrinho", text: "Cachorrinho de amigurumi caramelo com orelhas caídas marrons e coleira vermelha." },
  { emoji: "🦕", title: "Dinossauro fofo", text: "Dinossauro de amigurumi verde-menta com barriga creme e espinhos lilás nas costas." },
  { emoji: "👜", title: "Bolsa de crochê", text: "Bolsa de crochê redonda em fio de algodão bege com alça curta e fecho de botão." },
  { emoji: "💗", title: "Chaveiro de coração", text: "Chaveiro de coração em crochê rosa com uma pequena argola, cerca de 6 cm." },
];

const EMPTY: GenerationOptions = {
  description: "",
  category: null,
  difficulty: null,
  size: null,
  customSizeCm: null,
  colors: null,
  yarnType: "sugerir",
  yarnOther: null,
};

function loadDraft(): GenerationOptions {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* rascunho indisponível */
  }
  return EMPTY;
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  labels: Record<T, string>;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={value === null ? "chip-on" : "chip-off"} aria-pressed={value === null} onClick={() => onChange(null)}>
          IA escolhe
        </button>
        {options.map((o) => (
          <button key={o} type="button" className={value === o ? "chip-on" : "chip-off"} aria-pressed={value === o} onClick={() => onChange(o)}>
            {labels[o]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<GenerationOptions>(loadDraft);
  const [showOptions, setShowOptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      /* sem armazenamento: ignora */
    }
  }, [form]);

  const set = <K extends keyof GenerationOptions>(k: K, v: GenerationOptions[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = GenerationOptionsSchema.safeParse({
      ...form,
      colors: form.colors?.trim() || null,
      yarnOther: form.yarnType === "outros" ? form.yarnOther?.trim() || null : null,
      customSizeCm: form.size === "personalizado" ? form.customSizeCm : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    if (form.size === "personalizado" && !form.customSizeCm) {
      setError("Informe a medida personalizada em centímetros.");
      return;
    }
    if (!user) {
      navigate("/entrar?next=/&motivo=gerar");
      return;
    }
    setBusy(true);
    try {
      const result = await generateRecipe(parsed.data);
      sessionStorage.removeItem(DRAFT_KEY);
      navigate(`/receita/${result.id}?nova=1`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {busy && <GenerationProgress />}

      <section className="bg-stitches">
        <div className="mx-auto max-w-4xl px-4 pb-14 pt-12 text-center sm:pt-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-sm font-bold text-lilac-700">
            <YarnBall className="h-5 w-5" /> Receitas originais com contagem de pontos verificada
          </p>
          <h1 className="text-4xl font-semibold sm:text-5xl md:text-6xl">
            Transforme suas ideias em <span className="text-blush-500">receitas de crochê!</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-cocoa-700 sm:text-xl">
            Descreva o que deseja criar e deixe nossa inteligência artificial preparar uma receita personalizada para você.
          </p>

          <form onSubmit={onSubmit} className="card mx-auto mt-8 p-5 text-left sm:p-7">
            <label htmlFor="descricao" className="mb-2 block font-display text-xl font-semibold">
              O que você deseja confeccionar hoje?
            </label>
            <textarea
              id="descricao"
              className="input min-h-28 resize-y text-lg"
              placeholder="Uma coelhinha branca com laço rosa, aproximadamente 16 cm de altura."
              value={form.description}
              maxLength={800}
              onChange={(e) => set("description", e.target.value)}
              required
            />

            <button
              type="button"
              className="mt-4 flex w-full items-center justify-between rounded-2xl bg-cream-100 px-4 py-3 text-left font-bold text-cocoa-700 hover:bg-cream-200"
              aria-expanded={showOptions}
              aria-controls="personalizacao"
              onClick={() => setShowOptions((s) => !s)}
            >
              <span>Personalizar receita (tipo, nível, tamanho, cores e fio)</span>
              <span aria-hidden="true">{showOptions ? "−" : "+"}</span>
            </button>

            {showOptions && (
              <div id="personalizacao" className="mt-4 space-y-5">
                <Chips label="Tipo de peça" options={CATEGORIES} value={form.category} onChange={(v) => set("category", v)} labels={CATEGORY_LABELS} />
                <Chips label="Nível de dificuldade" options={DIFFICULTIES} value={form.difficulty} onChange={(v) => set("difficulty", v)} labels={DIFFICULTY_LABELS} />
                <div>
                  <Chips
                    label="Tamanho desejado"
                    options={["pequeno", "medio", "grande", "personalizado"] as const}
                    value={form.size}
                    onChange={(v) => set("size", v)}
                    labels={SIZE_LABELS}
                  />
                  {form.size === "personalizado" && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={200}
                        step={0.5}
                        className="input max-w-32"
                        aria-label="Medida em centímetros"
                        value={form.customSizeCm ?? ""}
                        onChange={(e) => set("customSizeCm", e.target.value ? Number(e.target.value) : null)}
                      />
                      <span className="font-bold text-cocoa-700">cm</span>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="cores" className="label">
                    Cores
                  </label>
                  <input
                    id="cores"
                    className="input"
                    placeholder="Ex.: branco, rosa-bebê e detalhes em lilás"
                    value={form.colors ?? ""}
                    maxLength={300}
                    onChange={(e) => set("colors", e.target.value)}
                  />
                </div>
                <fieldset>
                  <legend className="label">Tipo de fio</legend>
                  <div className="flex flex-wrap gap-2">
                    {(["sugerir", "algodao", "acrilico", "pelucia", "outros"] as const).map((y) => (
                      <button
                        key={y}
                        type="button"
                        className={form.yarnType === y ? "chip-on" : "chip-off"}
                        aria-pressed={form.yarnType === y}
                        onClick={() => set("yarnType", y)}
                      >
                        {YARN_LABELS[y]}
                      </button>
                    ))}
                  </div>
                  {form.yarnType === "outros" && (
                    <input
                      className="input mt-3"
                      placeholder="Qual fio você quer usar?"
                      value={form.yarnOther ?? ""}
                      maxLength={120}
                      onChange={(e) => set("yarnOther", e.target.value)}
                    />
                  )}
                  <p className="mt-2 text-sm text-cocoa-500">Não sabe qual escolher? Deixe a IA sugerir os materiais mais adequados.</p>
                </fieldset>
              </div>
            )}

            {error && (
              <div className="mt-4">
                <ErrorBox message={error} />
              </div>
            )}

            <button type="submit" className="btn-primary mt-5 w-full py-4 text-lg" disabled={busy}>
              Gerar minha receita
            </button>
            {!user && <p className="mt-2 text-center text-sm text-cocoa-500">Você fará login rapidinho antes de gerar, para salvar suas receitas.</p>}
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-3xl font-semibold">Ideias para começar</h2>
        <p className="mt-2 text-center text-cocoa-500">Toque em um exemplo para usar como ponto de partida.</p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.title}
              type="button"
              className="card flex flex-col items-center gap-2 p-5 text-center transition hover:-translate-y-0.5 hover:border-blush-200"
              onClick={() => {
                set("description", ex.text);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span className="text-4xl" aria-hidden="true">
                {ex.emoji}
              </span>
              <span className="font-bold">{ex.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-cream-100 px-4 py-14">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {[
            ["1. Descreva", "Conte o que quer fazer: bicho, boneca, flor, bolsa... Cores e tamanho ajudam."],
            ["2. Receba a receita", "Imagem ilustrativa, materiais, abreviações e todas as carreiras, com a matemática conferida."],
            ["3. Faça junto", "Acompanhe carreira por carreira, salve o progresso, baixe o PDF e tire dúvidas com a assistente."],
          ].map(([t, d]) => (
            <div key={t} className="card p-6">
              <h3 className="text-xl font-semibold text-blush-700">{t}</h3>
              <p className="mt-2 text-cocoa-700">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
