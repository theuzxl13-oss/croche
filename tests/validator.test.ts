import { describe, expect, it } from "vitest";
import { validateRecipe, needsCorrection, partsNeedingCorrection, initialAvailable } from "../shared/crochet/validator";
import { RecipeContentSchema } from "../shared/recipeSchema";
import { flattenSteps, recipeToPlainText } from "../shared/format";
import { ballPart, recipe, round } from "./fixtures";

describe("validateRecipe", () => {
  it("aprova uma receita matematicamente correta", () => {
    const report = validateRecipe(recipe());
    expect(report.errors).toEqual([]);
    expect(report.status).toBe("validada");
    expect(report.totalRounds).toBe(11);
    expect(report.verifiedRounds).toBe(11);
    expect(needsCorrection(report)).toBe(false);
  });

  it("detecta total declarado incorreto", () => {
    const part = ballPart();
    part.rounds[2] = round(3, "(1 pb, 1 aum) x 6", 20);
    const report = validateRecipe(recipe([part]));
    expect(report.status).toBe("com_erros");
    expect(report.errors.some((e) => e.code === "count_mismatch" && e.roundFrom === 3)).toBe(true);
    expect(partsNeedingCorrection(report)).toEqual([0]);
  });

  it("detecta repetição que não usa todos os pontos da carreira anterior", () => {
    const part = ballPart();
    part.rounds[3] = round(4, "(2 pb, 1 aum) x 5", 20);
    const report = validateRecipe(recipe([part]));
    expect(report.errors.some((e) => e.code === "consumption_mismatch")).toBe(true);
  });

  it("detecta bloco de carreiras repetidas com aumentos (inválido além da 1ª)", () => {
    const part = ballPart();
    part.rounds.splice(3, 0);
    part.rounds[2] = round(3, "(1 pb, 1 aum) x 6", 18, 4);
    part.rounds = part.rounds.filter((r) => r.from !== 4);
    const report = validateRecipe(recipe([part]));
    expect(report.errors.some((e) => e.code === "consumption_mismatch" && e.message.includes("Carreira 4"))).toBe(true);
  });

  it("detecta numeração pulada", () => {
    const part = ballPart();
    part.rounds = part.rounds.filter((r) => r.from !== 3);
    const report = validateRecipe(recipe([part]));
    expect(report.errors.some((e) => e.code === "numbering")).toBe(true);
  });

  it("proíbe instruções incompletas", () => {
    const part = ballPart();
    part.rounds[4] = round(5, "continue até o tamanho desejado", 24, 8);
    const report = validateRecipe(recipe([part]));
    expect(report.errors.some((e) => e.code === "incomplete")).toBe(true);
    expect(report.status).toBe("com_erros");
  });

  it("marca instruções ambíguas como ressalva que pede correção", () => {
    const part = ballPart();
    part.rounds[4] = round(5, "pb nos próximos 24 pontos", 24, 8);
    const report = validateRecipe(recipe([part]));
    expect(report.status).toBe("validada_com_ressalvas");
    expect(needsCorrection(report)).toBe(true);
  });

  it("carreiras especiais geram ressalva, mas não erro", () => {
    const part = ballPart();
    part.rounds[4] = round(5, "unir as pernas com 3 corr", 24, 8, "especial");
    const report = validateRecipe(recipe([part]));
    expect(report.errors).toEqual([]);
    expect(report.status).toBe("validada_com_ressalvas");
    expect(needsCorrection(report)).toBe(false);
  });

  it("valida peças planas iniciadas em correntinha", () => {
    const report = validateRecipe(
      recipe([
        {
          name: "Alça",
          quantity: 1,
          color: "Rosa",
          start: { type: "correntinha_plana", chains: 21 },
          rounds: [round(1, "20 pb", 20), round(2, "1 corr e virar, 20 pb", 20, 10)],
          finishing: "Arremate.",
        },
      ]),
    );
    expect(report.status).toBe("validada");
  });

  it("valida início oval", () => {
    expect(initialAvailable({ ...ballPart(), start: { type: "correntinha_oval", chains: 8 } }).available).toBe(13);
    const report = validateRecipe(
      recipe([
        {
          name: "Sola",
          quantity: 2,
          color: "Marrom",
          start: { type: "correntinha_oval", chains: 8 },
          rounds: [round(1, "1 aum, 5 pb, 4 pb no mesmo ponto, 5 pb, 1 aum", 18)],
          finishing: "Arremate.",
        },
      ]),
    );
    expect(report.errors).toEqual([]);
  });
});

describe("esquema e formatação", () => {
  it("fixture segue o esquema", () => {
    expect(RecipeContentSchema.safeParse(recipe()).success).toBe(true);
  });
  it("gera texto simples com todas as carreiras", () => {
    const txt = recipeToPlainText(recipe());
    expect(txt).toContain("1ª carreira: 6 pb no anel mágico (6).");
    expect(txt).toContain("5ª a 8ª carreira: 24 pb (24).");
    expect(txt).toContain("Aviso");
  });
  it("expande blocos para o modo de acompanhamento", () => {
    const steps = flattenSteps(recipe());
    expect(steps).toHaveLength(11);
    expect(steps[5]).toMatchObject({ roundNumber: 6, count: 24 });
  });
});
