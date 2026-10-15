import type { Part, RecipeContent, Round } from "../recipeSchema";
import { parseRoundText } from "./parser";

export type Severity = "error" | "warning";

export type IssueCode =
  | "no_parts"
  | "no_rounds"
  | "numbering"
  | "count_mismatch"
  | "consumption_mismatch"
  | "ambiguous"
  | "incomplete"
  | "invalid_count"
  | "special_round"
  | "start";

export interface ValidationIssue {
  severity: Severity;
  code: IssueCode;
  partIndex: number | null;
  partName: string | null;
  roundFrom: number | null;
  roundTo: number | null;
  message: string;
}

export interface RoundCheck {
  from: number;
  to: number;
  stated: number;
  computed: number | null;
  consumed: number | null;
  available: number | null;
  status: "ok" | "error" | "warning";
}

export interface PartCheck {
  partIndex: number;
  name: string;
  rounds: RoundCheck[];
}

export type ValidationStatus = "validada" | "validada_com_ressalvas" | "com_erros";

export interface ValidationReport {
  status: ValidationStatus;
  checkedAt: string;
  totalRounds: number;
  verifiedRounds: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  parts: PartCheck[];
}

/** Frases que indicam instruções incompletas e que são proibidas. */
const INCOMPLETE_PATTERNS: RegExp[] = [
  /continu(?:e|ar)\s+(?:assim\s+)?at[eé]/i,
  /repit(?:a|ir)\s+at[eé]\s+(?:o\s+tamanho|ficar|atingir|finalizar|terminar)/i,
  /at[eé]\s+(?:o\s+)?tamanho\s+desejado/i,
  /at[eé]\s+finalizar/i,
  /\betc\.?(?:\s|$)/i,
  /e\s+assim\s+por\s+diante/i,
  /quantas?\s+carreiras?\s+(?:quiser|desejar|precisar)/i,
];

export function findIncompletePhrase(text: string): string | null {
  for (const re of INCOMPLETE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/** Pontos disponíveis para a 1ª carreira, conforme o tipo de início. */
export function initialAvailable(part: Part): { available: number | null; issue: string | null } {
  const { type, chains } = part.start;
  if (type === "anel_magico" || type === "continua") return { available: null, issue: null };
  if (chains === null || chains < 2) {
    return { available: null, issue: `Início em correntinha sem quantidade válida de correntinhas.` };
  }
  switch (type) {
    case "correntinha_plana":
      // Trabalha-se a partir da 2ª correntinha a partir da agulha.
      return { available: chains - 1, issue: null };
    case "correntinha_circular":
      // Correntinhas fechadas em círculo: todas as correntinhas recebem pontos.
      return { available: chains, issue: null };
    case "correntinha_oval":
      // Os dois lados da correntinha, a partir da 2ª; a última correntinha é usada uma única vez (vira a ponta).
      return { available: 2 * chains - 3, issue: null };
  }
}

function makeIssue(
  severity: Severity,
  code: IssueCode,
  message: string,
  part?: { index: number; name: string },
  round?: Round,
): ValidationIssue {
  return {
    severity,
    code,
    message,
    partIndex: part?.index ?? null,
    partName: part?.name ?? null,
    roundFrom: round?.from ?? null,
    roundTo: round?.to ?? null,
  };
}

export function validatePart(part: Part, index: number): { check: PartCheck; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const ref = { index, name: part.name };
  const rounds: RoundCheck[] = [];

  if (part.rounds.length === 0) {
    issues.push(makeIssue("error", "no_rounds", `A peça "${part.name}" não possui carreiras.`, ref));
    return { check: { partIndex: index, name: part.name, rounds }, issues };
  }

  const start = initialAvailable(part);
  if (start.issue) issues.push(makeIssue("error", "start", start.issue, ref));

  let previous: number | null = start.available;
  let expectedNext = 1;

  for (const round of part.rounds) {
    const label = round.from === round.to ? `carreira ${round.from}` : `carreiras ${round.from} a ${round.to}`;

    if (round.from !== expectedNext || round.to < round.from) {
      issues.push(
        makeIssue(
          "error",
          "numbering",
          `Numeração fora de ordem em "${part.name}": esperado começar na carreira ${expectedNext}, encontrado ${label}.`,
          ref,
          round,
        ),
      );
    }
    expectedNext = Math.max(round.to, round.from) + 1;

    const incomplete = findIncompletePhrase(round.text);
    if (incomplete) {
      issues.push(makeIssue("error", "incomplete", `Instrução incompleta na ${label}: "${incomplete}".`, ref, round));
    }

    if (round.count <= 0) {
      issues.push(makeIssue("error", "invalid_count", `Total de pontos inválido (${round.count}) na ${label}.`, ref, round));
    }

    if (round.kind === "especial") {
      issues.push(
        makeIssue(
          "warning",
          "special_round",
          `A ${label} de "${part.name}" é especial e não pode ser conferida automaticamente; confira na prática.`,
          ref,
          round,
        ),
      );
      rounds.push({ from: round.from, to: round.to, stated: round.count, computed: null, consumed: null, available: previous, status: "warning" });
      previous = round.count;
      continue;
    }

    // Um bloco "carreiras 5 a 8" é verificado carreira a carreira.
    let status: RoundCheck["status"] = "ok";
    let lastComputed: number | null = null;
    let lastConsumed: number | null = null;
    const firstAvailable = previous;
    const span = Math.max(1, round.to - round.from + 1);

    for (let i = 0; i < span; i++) {
      const n = round.from + i;
      const parsed = parseRoundText(round.text, previous);
      lastComputed = parsed.produced;
      lastConsumed = parsed.consumed;

      if (!parsed.ok) {
        status = "warning";
        if (i === 0) {
          for (const msg of parsed.issues) {
            issues.push(makeIssue("warning", "ambiguous", `Instrução ambígua na ${label} de "${part.name}": ${msg}`, ref, round));
          }
        }
        // Sem interpretação segura, segue com o total declarado.
        previous = round.count;
        break;
      }

      if (previous !== null && parsed.consumed !== previous) {
        status = "error";
        issues.push(
          makeIssue(
            "error",
            "consumption_mismatch",
            `Carreira ${n} de "${part.name}": a instrução usa ${parsed.consumed} pontos, mas a carreira anterior tem ${previous}.`,
            ref,
            round,
          ),
        );
      }
      if (parsed.produced !== round.count) {
        status = "error";
        issues.push(
          makeIssue(
            "error",
            "count_mismatch",
            `Carreira ${n} de "${part.name}": a instrução resulta em ${parsed.produced} pontos, mas indica (${round.count}).`,
            ref,
            round,
          ),
        );
      }
      previous = round.count;
      if (status === "error") break;
    }

    rounds.push({
      from: round.from,
      to: round.to,
      stated: round.count,
      computed: lastComputed,
      consumed: lastConsumed,
      available: firstAvailable,
      status,
    });
  }

  if (findIncompletePhrase(part.finishing)) {
    issues.push(makeIssue("warning", "incomplete", `O acabamento de "${part.name}" contém instrução vaga.`, ref));
  }

  return { check: { partIndex: index, name: part.name, rounds }, issues };
}

export function validateRecipe(content: RecipeContent): ValidationReport {
  const all: ValidationIssue[] = [];
  const parts: PartCheck[] = [];

  if (content.parts.length === 0) {
    all.push(makeIssue("error", "no_parts", "A receita não possui peças com carreiras."));
  }

  content.parts.forEach((part, i) => {
    const { check, issues } = validatePart(part, i);
    parts.push(check);
    all.push(...issues);
  });

  for (const step of [...content.assembly, ...content.finishing]) {
    const phrase = findIncompletePhrase(step);
    if (phrase) all.push(makeIssue("warning", "incomplete", `Instrução de montagem/acabamento vaga: "${phrase}".`));
  }

  const errors = all.filter((i) => i.severity === "error");
  const warnings = all.filter((i) => i.severity === "warning");
  const totalRounds = parts.reduce((s, p) => s + p.rounds.reduce((a, r) => a + (r.to - r.from + 1), 0), 0);
  const verifiedRounds = parts.reduce(
    (s, p) => s + p.rounds.filter((r) => r.status === "ok").reduce((a, r) => a + (r.to - r.from + 1), 0),
    0,
  );

  return {
    status: errors.length > 0 ? "com_erros" : warnings.length > 0 ? "validada_com_ressalvas" : "validada",
    checkedAt: new Date().toISOString(),
    totalRounds,
    verifiedRounds,
    errors,
    warnings,
    parts,
  };
}

/** Problemas que justificam pedir uma correção automática à IA. */
export function needsCorrection(report: ValidationReport): boolean {
  return report.errors.length > 0 || report.warnings.some((w) => w.code === "ambiguous" || w.code === "incomplete");
}

/** Índices das peças com problemas corrigíveis. */
export function partsNeedingCorrection(report: ValidationReport): number[] {
  const set = new Set<number>();
  for (const issue of [...report.errors, ...report.warnings]) {
    if (issue.partIndex !== null && (issue.severity === "error" || issue.code === "ambiguous" || issue.code === "incomplete")) {
      set.add(issue.partIndex);
    }
  }
  return [...set].sort((a, b) => a - b);
}

export const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  validada: "Matemática verificada",
  validada_com_ressalvas: "Verificada com ressalvas",
  com_erros: "Não validada — contém erros",
};
