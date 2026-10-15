import { z } from "zod/v4";

/**
 * Esquema único da receita. É usado:
 *  - como formato de saída estruturada exigido do modelo de linguagem (backend);
 *  - para validar receitas salvas/editadas (frontend e backend).
 * Campos opcionais são representados como `nullable` para manter o esquema compatível
 * com saídas estruturadas.
 */

export const CATEGORIES = ["amigurumi", "roupas", "bolsas", "decoracao", "acessorios", "outros"] as const;
export const DIFFICULTIES = ["iniciante", "intermediario", "avancado"] as const;
export const START_TYPES = ["anel_magico", "correntinha_plana", "correntinha_oval", "correntinha_circular", "continua"] as const;
export const ROUND_KINDS = ["normal", "especial"] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  amigurumi: "Amigurumi",
  roupas: "Roupas",
  bolsas: "Bolsas",
  decoracao: "Decoração",
  acessorios: "Acessórios",
  outros: "Outros",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
};

export const RoundSchema = z.object({
  /** Número da primeira carreira deste bloco (1, 2, 3...). */
  from: z.number().int(),
  /** Número da última carreira deste bloco; igual a `from` quando é uma única carreira. */
  to: z.number().int(),
  /** Instrução no padrão brasileiro, ex.: "(2 pb, 1 aum) x 6". */
  text: z.string(),
  /** Total de pontos ao final de cada carreira do bloco. */
  count: z.number().int(),
  /** "especial" = carreira que não pode ser verificada automaticamente (ex.: união de pernas). */
  kind: z.enum(ROUND_KINDS),
  /** Observação opcional: troca de cor, enchimento, posição de olhos etc. */
  note: z.string().nullable(),
});

export const PartSchema = z.object({
  name: z.string(),
  /** Quantas peças iguais fazer (ex.: 2 braços). */
  quantity: z.number().int(),
  color: z.string(),
  start: z.object({
    type: z.enum(START_TYPES),
    /** Número de correntinhas da montagem (somente para inícios em correntinha). */
    chains: z.number().int().nullable(),
  }),
  rounds: z.array(RoundSchema),
  /** Fechamento, enchimento e arremate desta peça. */
  finishing: z.string(),
});

export const RecipeContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  heightCm: z.number().nullable(),
  sizeDescription: z.string(),
  estimatedTime: z.string(),
  yarn: z.object({
    type: z.string(),
    weight: z.string(),
    colors: z.array(
      z.object({
        color: z.string(),
        grams: z.number(),
        meters: z.number().nullable(),
      }),
    ),
  }),
  hook: z.object({
    sizeMm: z.number(),
    note: z.string().nullable(),
  }),
  materials: z.array(z.string()),
  abbreviations: z.array(z.object({ abbr: z.string(), meaning: z.string() })),
  notes: z.array(z.string()),
  parts: z.array(PartSchema),
  assembly: z.array(z.string()),
  finishing: z.array(z.string()),
  tips: z.array(z.string()),
  /** Descrição visual em inglês para o gerador de imagens. */
  imagePrompt: z.string(),
});

export type Category = (typeof CATEGORIES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type StartType = (typeof START_TYPES)[number];
export type Round = z.infer<typeof RoundSchema>;
export type Part = z.infer<typeof PartSchema>;
export type RecipeContent = z.infer<typeof RecipeContentSchema>;

/** Preferências escolhidas pelo usuário antes da geração. */
export const GenerationOptionsSchema = z.object({
  description: z.string().trim().min(5, "Descreva a peça com pelo menos 5 caracteres.").max(800, "Descrição muito longa (máx. 800 caracteres)."),
  category: z.enum(CATEGORIES).nullable(),
  difficulty: z.enum(DIFFICULTIES).nullable(),
  size: z.enum(["pequeno", "medio", "grande", "personalizado"]).nullable(),
  customSizeCm: z.number().min(2).max(200).nullable(),
  colors: z.string().trim().max(300).nullable(),
  yarnType: z.enum(["algodao", "acrilico", "pelucia", "outros", "sugerir"]).nullable(),
  yarnOther: z.string().trim().max(120).nullable(),
});

export type GenerationOptions = z.infer<typeof GenerationOptionsSchema>;

export const YARN_LABELS: Record<NonNullable<GenerationOptions["yarnType"]>, string> = {
  algodao: "Algodão",
  acrilico: "Acrílico",
  pelucia: "Fio de pelúcia",
  outros: "Outro",
  sugerir: "Deixar a IA sugerir",
};

export const SIZE_LABELS: Record<NonNullable<GenerationOptions["size"]>, string> = {
  pequeno: "Pequeno",
  medio: "Médio",
  grande: "Grande",
  personalizado: "Personalizado",
};
