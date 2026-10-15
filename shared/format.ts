import { CATEGORY_LABELS, DIFFICULTY_LABELS, type RecipeContent, type Round } from "./recipeSchema";

export function roundLabel(round: Pick<Round, "from" | "to">): string {
  return round.from === round.to ? `${round.from}ª carreira` : `${round.from}ª a ${round.to}ª carreira`;
}

export function roundLine(round: Round): string {
  const text = round.text.replace(/\s*\(\s*\d+\s*\)\s*\.?\s*$/, "");
  const note = round.note ? ` — ${round.note}` : "";
  return `${roundLabel(round)}: ${text} (${round.count}).${note}`;
}

export function startLabel(start: RecipeContent["parts"][number]["start"]): string {
  switch (start.type) {
    case "anel_magico":
      return "Início em anel mágico (AM).";
    case "correntinha_plana":
      return `Monte ${start.chains} correntinhas e trabalhe a partir da 2ª correntinha a partir da agulha.`;
    case "correntinha_oval":
      return `Monte ${start.chains} correntinhas e trabalhe dos dois lados da correntinha (início oval), a partir da 2ª correntinha.`;
    case "correntinha_circular":
      return `Monte ${start.chains} correntinhas e feche em círculo com 1 pbx na 1ª correntinha.`;
    case "continua":
      return "Continue a partir da peça anterior, sem arrematar.";
  }
}

export function heightLabel(content: Pick<RecipeContent, "heightCm" | "sizeDescription">): string {
  return content.heightCm ? `${String(content.heightCm).replace(".", ",")} cm` : content.sizeDescription;
}

/** Versão em texto simples (para copiar/compartilhar). */
export function recipeToPlainText(c: RecipeContent): string {
  const lines: string[] = [];
  lines.push(c.title.toUpperCase());
  lines.push("Receita gerada por IA — Fio & Ponto IA");
  lines.push(`Categoria: ${CATEGORY_LABELS[c.category]}`);
  lines.push(`Tamanho aproximado: ${heightLabel(c)}`);
  lines.push(`Nível: ${DIFFICULTY_LABELS[c.difficulty]}`);
  lines.push(`Tempo estimado: ${c.estimatedTime}`);
  lines.push("");
  if (c.summary) lines.push(c.summary, "");

  lines.push("MATERIAIS");
  lines.push(`- Fio: ${c.yarn.type} (${c.yarn.weight})`);
  for (const y of c.yarn.colors) {
    lines.push(`  • ${y.color}: aprox. ${y.grams} g${y.meters ? ` (~${y.meters} m)` : ""}`);
  }
  lines.push(`- Agulha de crochê de ${String(c.hook.sizeMm).replace(".", ",")} mm${c.hook.note ? ` (${c.hook.note})` : ""}`);
  for (const m of c.materials) lines.push(`- ${m}`);
  lines.push("");

  lines.push("ABREVIAÇÕES");
  for (const a of c.abbreviations) lines.push(`- ${a.abbr} — ${a.meaning}`);
  lines.push("");

  if (c.notes.length) {
    lines.push("OBSERVAÇÕES");
    for (const n of c.notes) lines.push(`- ${n}`);
    lines.push("");
  }

  for (const part of c.parts) {
    lines.push(`${part.name.toUpperCase()}${part.quantity > 1 ? ` (faça ${part.quantity})` : ""} — cor: ${part.color}`);
    lines.push(startLabel(part.start));
    for (const r of part.rounds) lines.push(roundLine(r));
    if (part.finishing) lines.push(part.finishing);
    lines.push("");
  }

  lines.push("MONTAGEM");
  c.assembly.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("");
  if (c.finishing.length) {
    lines.push("ACABAMENTO");
    c.finishing.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("");
  }
  if (c.tips.length) {
    lines.push("DICAS");
    for (const t of c.tips) lines.push(`- ${t}`);
    lines.push("");
  }
  lines.push(
    "Aviso: receita gerada por inteligência artificial. A contagem de pontos foi conferida automaticamente, mas a peça pode exigir ajustes práticos de tensão, tamanho e montagem.",
  );
  return lines.join("\n");
}

/** Lista linear de passos para o modo de acompanhamento. */
export interface FollowStep {
  key: string;
  partIndex: number;
  partName: string;
  partQuantity: number;
  roundNumber: number;
  text: string;
  count: number;
  note: string | null;
}

export function flattenSteps(c: RecipeContent): FollowStep[] {
  const steps: FollowStep[] = [];
  c.parts.forEach((part, partIndex) => {
    for (const r of part.rounds) {
      for (let n = r.from; n <= Math.max(r.from, r.to); n++) {
        steps.push({
          key: `${partIndex}:${n}`,
          partIndex,
          partName: part.name,
          partQuantity: part.quantity,
          roundNumber: n,
          text: r.text.replace(/\s*\(\s*\d+\s*\)\s*\.?\s*$/, ""),
          count: r.count,
          note: r.note,
        });
      }
    }
  });
  return steps;
}
