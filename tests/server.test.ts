import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mergeCorrections } from "../server/recipeGenerator";
import { correctionPrompt, imagePrompt, recipeUserPrompt } from "../server/prompts";
import { HttpError, readJson, route, type ApiRequest } from "../server/http";
import { validateRecipe } from "../shared/crochet/validator";
import { GenerationOptionsSchema } from "../shared/recipeSchema";
import { ballPart, recipe, round } from "./fixtures";

describe("ciclo de correção", () => {
  it("substitui somente as peças corrigidas", () => {
    const broken = ballPart();
    broken.rounds[1] = round(2, "6 aum", 14);
    const c = recipe([ballPart(), broken]);
    expect(validateRecipe(c).status).toBe("com_erros");
    const fixed = mergeCorrections(c, { parts: [{ index: 1, part: ballPart() }, { index: 9, part: ballPart() }] });
    expect(fixed.parts).toHaveLength(2);
    expect(validateRecipe(fixed).status).toBe("validada");
  });

  it("o pedido de correção cita os erros e as peças", () => {
    const broken = ballPart();
    broken.rounds[1] = round(2, "6 aum", 14);
    const c = recipe([broken]);
    const text = correctionPrompt(c, validateRecipe(c), [0]);
    expect(text).toContain("resulta em 12 pontos, mas indica (14)");
    expect(text).toContain('"index": 0');
  });
});

describe("prompts", () => {
  it("inclui as preferências do usuário", () => {
    const opts = GenerationOptionsSchema.parse({
      description: "Coelhinha branca com laço lilás",
      category: "amigurumi",
      difficulty: "iniciante",
      size: "personalizado",
      customSizeCm: 16,
      colors: "branco e lilás",
      yarnType: "sugerir",
      yarnOther: null,
    });
    const p = recipeUserPrompt(opts);
    expect(p).toContain("Coelhinha branca");
    expect(p).toContain("aproximadamente 16 cm");
    expect(p).toContain("sugira o mais adequado");
  });
  it("prompt de imagem pede aparência de crochê real e as cores", () => {
    const p = imagePrompt(recipe(), "branco e rosa");
    expect(p).toMatch(/crochet/);
    expect(p).toContain("branco e rosa");
    expect(p).toMatch(/No text/);
  });
  it("rejeita descrições vazias ou longas demais", () => {
    const base = { category: null, difficulty: null, size: null, customSizeCm: null, colors: null, yarnType: null, yarnOther: null };
    expect(GenerationOptionsSchema.safeParse({ ...base, description: "oi" }).success).toBe(false);
    expect(GenerationOptionsSchema.safeParse({ ...base, description: "x".repeat(900) }).success).toBe(false);
  });
});

describe("http", () => {
  it("lê JSON do corpo da requisição", async () => {
    const req = Readable.from([Buffer.from('{"a":1}')]) as unknown as ApiRequest;
    await expect(readJson(req)).resolves.toEqual({ a: 1 });
  });
  it("rejeita JSON inválido", async () => {
    const req = Readable.from([Buffer.from("{oops")]) as unknown as ApiRequest;
    await expect(readJson(req)).rejects.toBeInstanceOf(HttpError);
  });
  it("route bloqueia métodos não permitidos e converte HttpError", async () => {
    const makeRes = () => {
      const res = { statusCode: 0, headers: {} as Record<string, string>, body: "", headersSent: false } as {
        statusCode: number;
        headers: Record<string, string>;
        body: string;
        headersSent: boolean;
        setHeader: (k: string, v: string) => void;
        end: (b?: string) => void;
      };
      res.setHeader = (k, v) => (res.headers[k] = v);
      res.end = (b) => (res.body = b ?? "");
      return res;
    };
    const h = route(["POST"], async () => {
      throw new HttpError(429, "Limite atingido");
    });
    const r1 = makeRes();
    await h({ method: "GET" } as ApiRequest, r1 as never);
    expect(r1.statusCode).toBe(405);
    const r2 = makeRes();
    await h({ method: "POST" } as ApiRequest, r2 as never);
    expect(r2.statusCode).toBe(429);
    expect(JSON.parse(r2.body).error).toBe("Limite atingido");
  });
});
