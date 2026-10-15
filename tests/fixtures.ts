import type { Part, RecipeContent, Round } from "../shared/recipeSchema";

export function round(from: number, text: string, count: number, to = from, kind: Round["kind"] = "normal"): Round {
  return { from, to, text, count, kind, note: null };
}

export function ballPart(): Part {
  return {
    name: "Cabeça",
    quantity: 1,
    color: "Branco",
    start: { type: "anel_magico", chains: null },
    rounds: [
      round(1, "6 pb no anel mágico", 6),
      round(2, "6 aum", 12),
      round(3, "(1 pb, 1 aum) x 6", 18),
      round(4, "(2 pb, 1 aum) x 6", 24),
      round(5, "24 pb", 24, 8),
      round(9, "(2 pb, 1 dim) x 6", 18),
      round(10, "(1 pb, 1 dim) x 6", 12),
      round(11, "6 dim", 6),
    ],
    finishing: "Encha firmemente, feche passando a agulha de tapeçaria pelas alças da frente e arremate.",
  };
}

export function recipe(parts: Part[] = [ballPart()]): RecipeContent {
  return {
    title: "Bolinha de teste",
    summary: "Receita de teste.",
    category: "amigurumi",
    difficulty: "iniciante",
    heightCm: 5,
    sizeDescription: "Pequena",
    estimatedTime: "1 hora",
    yarn: { type: "Algodão", weight: "Fio 4/8", colors: [{ color: "Branco", grams: 10, meters: 20 }] },
    hook: { sizeMm: 2.5, note: null },
    materials: ["Fibra siliconada", "Agulha de tapeçaria"],
    abbreviations: [{ abbr: "pb", meaning: "ponto baixo" }],
    notes: [],
    parts,
    assembly: ["Não há montagem."],
    finishing: ["Esconda as pontas do fio."],
    tips: [],
    imagePrompt: "a small white crochet ball",
  };
}
