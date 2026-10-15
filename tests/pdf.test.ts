import { describe, expect, it } from "vitest";
import { buildRecipePdf } from "../src/lib/pdf";
import { ballPart, recipe } from "./fixtures";

describe("PDF", () => {
  it("gera A4 com capa, páginas numeradas e texto selecionável", async () => {
    // Várias peças para forçar quebra de página.
    const c = recipe(Array.from({ length: 6 }, (_, i) => ({ ...ballPart(), name: `Peça ${i + 1}` })));
    const doc = await buildRecipePdf(c, { imageUrl: null, status: "validada" });
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    // Texto real (operadores de texto do PDF, não imagem), antes da compressão:
    const pageText = (n: number) => ((doc.internal as unknown as { pages: string[][] }).pages[n] ?? []).join("\n");
    expect(pageText(2)).toMatch(/\(MATERIAIS\) Tj/);
    expect(pageText(pages)).toMatch(new RegExp(`gina ${pages - 1} de ${pages - 1}\\) Tj`));
  });
});
