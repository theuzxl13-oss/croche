import { describe, expect, it } from "vitest";
import { parseRoundText, splitTopLevel, stripStatedCount, normalizeInstruction } from "../shared/crochet/parser";

const p = (text: string, available: number | null = null) => parseRoundText(text, available);

describe("normalização", () => {
  it("remove acentos e padroniza símbolos", () => {
    expect(normalizeInstruction("(1 pb, 1 AUM) × 6 — Diminuição")).toBe("(1 pb, 1 aum) x 6 - diminuicao");
  });
  it("remove a contagem final", () => {
    expect(stripStatedCount("6 aum (12)")).toBe("6 aum");
    expect(stripStatedCount("18 pb (18 pontos).")).toBe("18 pb");
  });
  it("divide itens apenas no nível superior", () => {
    expect(splitTopLevel("2 pb, (1 pb, 1 aum) x 3, 1 dim")).toEqual(["2 pb", "(1 pb, 1 aum) x 3", "1 dim"]);
  });
});

describe("carreiras básicas", () => {
  it("anel mágico", () => {
    expect(p("6 pb no anel mágico (6)")).toMatchObject({ ok: true, consumed: 0, produced: 6 });
    expect(p("6 pb no AM")).toMatchObject({ ok: true, consumed: 0, produced: 6 });
  });
  it("aumentos", () => {
    expect(p("6 aum (12)", 6)).toMatchObject({ ok: true, consumed: 6, produced: 12 });
  });
  it("grupos repetidos em formatos diferentes", () => {
    for (const t of ["(1 pb, 1 aum) x 6", "(1 pb, 1 aum) repetir 6 vezes", "*1 pb, 1 aum* 6 vezes", "[1 pb, 1 aum] x6", "6x (1 pb, 1 aum)", "(1 pb, 1 aum) × 6"]) {
      expect(p(t, 12), t).toMatchObject({ ok: true, consumed: 12, produced: 18 });
    }
  });
  it("diminuições", () => {
    expect(p("(2 pb, 1 dim) x 6 (18)", 24)).toMatchObject({ ok: true, consumed: 24, produced: 18 });
    expect(p("6 dim", 12)).toMatchObject({ ok: true, consumed: 12, produced: 6 });
  });
  it("pontos em todos os pontos usam o total anterior", () => {
    expect(p("pb em todos os pontos (24)", 24)).toMatchObject({ ok: true, consumed: 24, produced: 24 });
    expect(p("24 pb", 24)).toMatchObject({ ok: true, consumed: 24, produced: 24 });
  });
  it("sequências com deslocamento", () => {
    expect(p("1 pb, (2 pb, 1 aum) x 5, 1 pb, 1 aum (24)", 18)).toMatchObject({ ok: true, consumed: 18, produced: 24 });
  });
  it("vários pontos no mesmo ponto e aumento triplo", () => {
    expect(p("5 pb, 3 pb no mesmo ponto", 6)).toMatchObject({ ok: true, consumed: 6, produced: 8 });
    expect(p("1 aum triplo", 1)).toMatchObject({ ok: true, consumed: 1, produced: 3 });
  });
  it("correntinha e virar não alteram a contagem", () => {
    expect(p("1 corr e virar, 10 pb", 10)).toMatchObject({ ok: true, consumed: 10, produced: 10 });
  });
  it("pular pontos e correntinhas no meio (casa de botão)", () => {
    expect(p("4 pb, 2 corr, pular 2 pontos, 4 pb", 10)).toMatchObject({ ok: true, consumed: 10, produced: 10 });
  });
  it("modificadores de alça não alteram a contagem", () => {
    expect(p("30 pb somente na alça de trás", 30)).toMatchObject({ ok: true, consumed: 30, produced: 30 });
  });
  it("pbx de fechamento não conta como ponto", () => {
    expect(p("18 pb, 1 pbx no primeiro ponto para fechar", 18)).toMatchObject({ ok: true, consumed: 18, produced: 18 });
  });
  it("aceita mpa, pa e nomes por extenso", () => {
    expect(p("(1 ponto alto, 1 aumento) x 4", 8)).toMatchObject({ ok: true, consumed: 8, produced: 12 });
    expect(p("12 mpa", 12)).toMatchObject({ ok: true, consumed: 12, produced: 12 });
  });
});

describe("ambiguidades", () => {
  it("sinaliza texto não reconhecido", () => {
    const r = p("faça pontos até ficar bonito", 12);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });
  it("sinaliza quantidade escondida no complemento", () => {
    expect(p("pb nos próximos 6 pontos", 6).ok).toBe(false);
  });
  it("sinaliza 'em todos os pontos' dentro de grupo", () => {
    expect(p("(pb em todos os pontos) x 2", 6).ok).toBe(false);
  });
});
