import type { ReactNode } from "react";
import type { RecipeContent } from "../../shared/recipeSchema";
import type { ValidationReport } from "../../shared/crochet/validator";
import { roundLabel, startLabel } from "../../shared/format";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="avoid-break">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

/** Exibição completa e legível da receita (também usada na impressão). */
export default function RecipeView({ content, report }: { content: RecipeContent; report?: ValidationReport }) {
  const roundStatus = (partIndex: number, from: number) =>
    report?.parts.find((p) => p.partIndex === partIndex)?.rounds.find((r) => r.from === from)?.status;

  return (
    <div className="space-y-8">
      <Section title="Materiais">
        <ul className="space-y-1.5">
          <li>
            <strong>Fio:</strong> {content.yarn.type} ({content.yarn.weight})
            <ul className="ml-5 mt-1 list-disc text-cocoa-700">
              {content.yarn.colors.map((y) => (
                <li key={y.color}>
                  {y.color}: aprox. {y.grams} g{y.meters ? ` (~${y.meters} m)` : ""}
                </li>
              ))}
            </ul>
          </li>
          <li>
            <strong>Agulha:</strong> {String(content.hook.sizeMm).replace(".", ",")} mm{content.hook.note ? ` — ${content.hook.note}` : ""}
          </li>
          {content.materials.map((m) => (
            <li key={m} className="flex gap-2">
              <span className="text-blush-400" aria-hidden="true">
                •
              </span>
              {m}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Abreviações">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {content.abbreviations.map((a) => (
            <div key={a.abbr} className="flex gap-2">
              <dt className="min-w-12 font-bold text-blush-700">{a.abbr}</dt>
              <dd>{a.meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {content.notes.length > 0 && (
        <Section title="Observações">
          <ul className="list-disc space-y-1 pl-5">
            {content.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Section>
      )}

      {content.parts.map((part, pi) => (
        <section key={pi} className="rounded-3xl bg-cream-100 p-5">
          <h2 className="font-display text-2xl font-semibold text-cocoa-900">
            {part.name}
            {part.quantity > 1 && <span className="ml-2 text-base font-bold text-lilac-500">(faça {part.quantity})</span>}
          </h2>
          <p className="text-sm font-bold text-cocoa-500">Cor: {part.color}</p>
          <p className="mt-2 text-cocoa-700">{startLabel(part.start)}</p>
          <ol className="mt-3 space-y-2">
            {part.rounds.map((r) => {
              const st = roundStatus(pi, r.from);
              return (
                <li
                  key={r.from}
                  className={`rounded-2xl px-3 py-2 ${st === "error" ? "border-2 border-red-300 bg-red-50" : st === "warning" ? "bg-amber-50" : "bg-white"}`}
                >
                  <span className="font-bold text-blush-700">{roundLabel(r)}:</span> {r.text.replace(/\s*\(\s*\d+\s*\)\s*\.?\s*$/, "")}{" "}
                  <span className="font-bold">({r.count})</span>
                  {r.note && <span className="mt-0.5 block text-sm text-lilac-700">↳ {r.note}</span>}
                  {st === "error" && <span className="mt-0.5 block text-sm font-bold text-red-700">Contagem com erro — confira esta carreira.</span>}
                </li>
              );
            })}
          </ol>
          {part.finishing && <p className="mt-3 rounded-2xl bg-lilac-50 px-3 py-2 text-lilac-700">{part.finishing}</p>}
        </section>
      ))}

      <Section title="Montagem">
        <ol className="list-decimal space-y-2 pl-5">
          {content.assembly.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </Section>

      {content.finishing.length > 0 && (
        <Section title="Acabamento">
          <ol className="list-decimal space-y-2 pl-5">
            {content.finishing.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Section>
      )}

      {content.tips.length > 0 && (
        <Section title="Dicas">
          <ul className="space-y-2">
            {content.tips.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true">💡</span>
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
