/**
 * Interpretador da notação brasileira de crochê.
 *
 * Converte o texto de uma carreira (ex.: "(2 pb, 1 aum) x 6") em quantas laçadas/pontos
 * da carreira anterior foram CONSUMIDOS e quantos pontos novos foram PRODUZIDOS.
 *
 * Regras de cada ponto:
 *   pb, pbx, mpa, pa, pad ............ consome 1, produz 1
 *   aum ............................... consome 1, produz 2
 *   aum triplo ........................ consome 1, produz 3
 *   dim ............................... consome 2, produz 1
 *   dim tripla ........................ consome 3, produz 1
 *   corr .............................. consome 0, produz 1
 *   pular N ........................... consome N, produz 0
 *   N pb no mesmo ponto ............... consome 1, produz N
 *   N pb no anel mágico ............... consome 0, produz N
 *   1 corr e virar .................... não altera a contagem
 */

export interface ParseResult {
  /** true quando todo o texto foi compreendido sem ambiguidades. */
  ok: boolean;
  consumed: number;
  produced: number;
  /** Trechos que não puderam ser interpretados com segurança. */
  issues: string[];
}

interface StitchDef {
  re: RegExp;
  consumes: number;
  produces: number;
  name: string;
}

// Ordem importa: formas mais específicas primeiro.
const STITCHES: StitchDef[] = [
  { re: /^(?:aum(?:ento)?s?)\s+tripl[oa]s?\b/, consumes: 1, produces: 3, name: "aum triplo" },
  { re: /^aum(?:ento)?s?\b/, consumes: 1, produces: 2, name: "aum" },
  { re: /^(?:dim(?:inuicao|inuicoes)?s?)\s+tripl[oa]s?\b/, consumes: 3, produces: 1, name: "dim tripla" },
  { re: /^dim(?:inuicao|inuicoes)?s?\b/, consumes: 2, produces: 1, name: "dim" },
  { re: /^(?:pbx|pontos?\s+baixissimos?)\b/, consumes: 1, produces: 1, name: "pbx" },
  { re: /^(?:pb|pontos?\s+baixos?)\b/, consumes: 1, produces: 1, name: "pb" },
  { re: /^(?:mpa|meios?\s+pontos?\s+altos?)\b/, consumes: 1, produces: 1, name: "mpa" },
  { re: /^(?:pad|pontos?\s+altos?\s+duplos?)\b/, consumes: 1, produces: 1, name: "pad" },
  { re: /^(?:pa|pontos?\s+altos?)\b/, consumes: 1, produces: 1, name: "pa" },
  { re: /^(?:corr(?:entinhas?|s)?|correntinhas?)\b/, consumes: 0, produces: 1, name: "corr" },
];

const SAME_STITCH = /\b(?:no mesmo ponto|na mesma (?:corr(?:entinha)?|laçada|lacada)|no mesmo lugar|no ultimo ponto|na ultima(?: corr(?:entinha)?)?|na primeira corr(?:entinha)?|no primeiro ponto)\b/;
const IN_RING = /\b(?:no anel(?: magico)?|no am|dentro do anel)\b/;
const ALL_STITCHES = /\b(?:em todos os pontos|em cada ponto|em todos|ao redor|em toda a (?:volta|carreira)|em volta|em cada um dos pontos)\b/;
const JOIN_SLIP = /\b(?:fechar|fechando|unir|unindo|para fechar|para unir)\b/;
const IGNORABLE_ITEM = /^(?:trocar|troque|mudar|mude|com a cor|cor\b|arrematar|arremate|deixar|encher|encha)/;

/** Normaliza o texto: minúsculas, sem acentos, símbolos padronizados. */
export function normalizeInstruction(text: string): string {
  return text
    .replace(/ª/g, "a")
    .replace(/º/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove a contagem final entre parênteses, ex.: "6 aum (12)" → "6 aum". */
export function stripStatedCount(text: string): string {
  return text
    .replace(/\s*[[(]\s*=?\s*\d+\s*(?:pontos?|pts?|p)?\s*[\])]\s*\.?\s*$/, "")
    .replace(/\s*=\s*\d+\s*(?:pontos?|pts?)?\s*\.?\s*$/, "")
    .replace(/[.;]\s*$/, "")
    .trim();
}

/** Divide em itens no nível superior (fora de parênteses/colchetes/asteriscos). */
export function splitTopLevel(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let star = false;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "*") star = !star;

    if (depth === 0 && !star) {
      if (ch === "," || ch === ";") {
        items.push(current);
        current = "";
        continue;
      }
      if (text.startsWith(" e ", i)) {
        items.push(current);
        current = "";
        i += 2;
        continue;
      }
    }
    current += ch;
  }
  items.push(current);
  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}

const GROUP_RE =
  /^[([*]\s*(.+?)\s*[)\]*]\s*(?:(?:x|vezes)\s*(\d+)|(\d+)\s*x|(?:repetir|repita|rep\.?|fazer|faca)?\s*(?:mais\s+)?(\d+)\s*vezes)?\s*(?:no total|ao todo|em toda a carreira)?$/;
const PREFIX_GROUP_RE = /^(?:(\d+)\s*x|(?:repetir|repita|fazer|faca)\s*(\d+)\s*vezes:?)\s*[([*]\s*(.+?)\s*[)\]*]$/;

interface Ctx {
  /** Pontos disponíveis restantes (null quando desconhecido, ex.: anel mágico). */
  remaining: number | null;
  insideGroup: boolean;
}

function parseItems(items: string[], ctx: Ctx, issues: string[]): { consumed: number; produced: number } {
  let consumed = 0;
  let produced = 0;
  for (const item of items) {
    const r = parseItem(item, { ...ctx, remaining: ctx.remaining === null ? null : ctx.remaining - consumed }, issues);
    consumed += r.consumed;
    produced += r.produced;
  }
  return { consumed, produced };
}

function parseItem(raw: string, ctx: Ctx, issues: string[]): { consumed: number; produced: number } {
  const item = raw.trim();
  if (!item) return { consumed: 0, produced: 0 };
  if (item === "@virar") return { consumed: 0, produced: 0 };

  // Grupos repetidos: "(1 pb, 1 aum) x 6", "*2 pb, 1 dim* 6 vezes", "6x (1 pb, 1 aum)".
  let groupBody: string | null = null;
  let repeat = 1;
  const g = item.match(GROUP_RE);
  if (g) {
    groupBody = g[1];
    repeat = Number(g[2] ?? g[3] ?? g[4] ?? 1);
  } else {
    const p = item.match(PREFIX_GROUP_RE);
    if (p) {
      groupBody = p[3];
      repeat = Number(p[1] ?? p[2] ?? 1);
    }
  }
  if (groupBody !== null) {
    if (!Number.isFinite(repeat) || repeat < 1) {
      issues.push(`Número de repetições inválido em "${raw}".`);
      return { consumed: 0, produced: 0 };
    }
    const inner = parseItems(splitTopLevel(groupBody), { remaining: null, insideGroup: true }, issues);
    return { consumed: inner.consumed * repeat, produced: inner.produced * repeat };
  }

  if (IGNORABLE_ITEM.test(item)) return { consumed: 0, produced: 0 };

  // Pular pontos.
  const skip = item.match(/^pul(?:ar|e)\s*(\d+)?\s*(?:pontos?|pts?|p)?\b/);
  if (skip) {
    const n = Number(skip[1] ?? 1);
    return { consumed: n, produced: 0 };
  }

  // Átomo: [quantidade] ponto [complemento]
  const m = item.match(/^(\d+)?\s*(.*)$/)!;
  const explicitCount = m[1] !== undefined ? Number(m[1]) : null;
  const afterCount = m[2];
  const def = STITCHES.find((s) => s.re.test(afterCount));
  if (!def) {
    issues.push(`Trecho não reconhecido: "${raw}".`);
    return { consumed: 0, produced: 0 };
  }
  const rest = afterCount.replace(def.re, "").trim();

  // Números escondidos no complemento (exceto ordinais como "2a corr") tornam a instrução ambígua.
  const restWithoutOrdinals = rest.replace(/\b\d+\s*[ao]\b/g, "");
  if (/\d/.test(restWithoutOrdinals)) {
    issues.push(`Quantidade ambígua em "${raw}". Use apenas "N ponto" ou um grupo "( ... ) x N".`);
  }

  // Ponto baixíssimo usado só para fechar a volta não conta como ponto.
  if (def.name === "pbx" && JOIN_SLIP.test(rest)) return { consumed: 0, produced: 0 };

  if (IN_RING.test(rest)) {
    const n = explicitCount ?? 1;
    return { consumed: 0, produced: n * def.produces };
  }

  if (SAME_STITCH.test(rest) && explicitCount !== null && explicitCount > 1 && def.consumes === 1) {
    return { consumed: 1, produced: explicitCount * def.produces };
  }

  let count = explicitCount ?? 1;
  if (ALL_STITCHES.test(rest) && explicitCount === null) {
    if (ctx.insideGroup || ctx.remaining === null) {
      issues.push(`"${raw}" depende do total da carreira anterior, que não pôde ser determinado.`);
      return { consumed: 0, produced: 0 };
    }
    if (def.consumes === 0) {
      issues.push(`"${raw}" não faz sentido para correntinhas.`);
      return { consumed: 0, produced: 0 };
    }
    count = Math.floor(ctx.remaining / def.consumes);
    if (count * def.consumes !== ctx.remaining) {
      issues.push(`"${raw}": ${ctx.remaining} pontos restantes não são divisíveis por ${def.consumes}.`);
    }
  }

  return { consumed: count * def.consumes, produced: count * def.produces };
}

/**
 * Interpreta o texto de uma carreira.
 * @param available pontos da carreira anterior (null quando não se aplica, ex.: anel mágico).
 */
export function parseRoundText(text: string, available: number | null): ParseResult {
  const issues: string[] = [];
  let norm = stripStatedCount(normalizeInstruction(text));
  // Remove rótulos como "1a carreira:" / "carr 3:" no início.
  norm = norm.replace(/^(?:\d+\s*a?\s*)?(?:carreiras?|carr\.?|volta|v)\s*\d*\s*(?:a\s*\d+)?\s*:\s*/, "");
  // "1 corr e virar", "1 corr, vire" → marcador neutro.
  norm = norm.replace(/(?:\d+\s*)?corr(?:entinhas?)?\s*(?:,|e)?\s*(?:e\s*)?vir(?:ar|e)(?: o trabalho)?/g, "@virar");
  norm = norm.replace(/(?<!@)\bvir(?:ar|e)(?: o trabalho)?\b/g, "@virar");

  if (!norm) {
    return { ok: false, consumed: 0, produced: 0, issues: ["Carreira sem instruções."] };
  }

  const { consumed, produced } = parseItems(splitTopLevel(norm), { remaining: available, insideGroup: false }, issues);
  return { ok: issues.length === 0, consumed, produced, issues };
}
