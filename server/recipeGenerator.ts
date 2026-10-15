import { z } from "zod/v4";
import { PartSchema, RecipeContentSchema, type GenerationOptions, type RecipeContent } from "../shared/recipeSchema";
import { needsCorrection, partsNeedingCorrection, validateRecipe, type ValidationReport } from "../shared/crochet/validator";
import { correctionPrompt, recipeUserPrompt, RECIPE_SYSTEM_PROMPT } from "./prompts";
import { generateStructured } from "./llm";
import { envInt } from "./http";

const CorrectionSchema = z.object({
  parts: z.array(z.object({ index: z.number().int(), part: PartSchema })),
});

export interface GenerationResult {
  content: RecipeContent;
  report: ValidationReport;
  correctionRounds: number;
}

/** Substitui as peças corrigidas, ignorando índices inválidos. */
export function mergeCorrections(content: RecipeContent, fixes: z.infer<typeof CorrectionSchema>): RecipeContent {
  const parts = [...content.parts];
  for (const fix of fixes.parts) {
    if (fix.index >= 0 && fix.index < parts.length) parts[fix.index] = fix.part;
  }
  return { ...content, parts };
}

/**
 * Gera a receita e executa o ciclo: validar → pedir correção das peças com erro → validar de novo.
 * A receita só é marcada como "validada" se o verificador não encontrar erros.
 */
export async function generateRecipe(options: GenerationOptions): Promise<GenerationResult> {
  let content = await generateStructured({
    system: RECIPE_SYSTEM_PROMPT,
    user: recipeUserPrompt(options),
    schema: RecipeContentSchema,
  });

  let report = validateRecipe(content);
  const maxCorrections = envInt("RECIPE_MAX_CORRECTIONS", 2);
  let correctionRounds = 0;

  while (needsCorrection(report) && correctionRounds < maxCorrections) {
    const indexes = partsNeedingCorrection(report);
    if (indexes.length === 0) break;
    correctionRounds++;
    const fixes = await generateStructured({
      system: RECIPE_SYSTEM_PROMPT,
      user: correctionPrompt(content, report, indexes),
      schema: CorrectionSchema,
    });
    const candidate = mergeCorrections(content, fixes);
    const candidateReport = validateRecipe(candidate);
    // Só aceita a correção se ela não piorar a receita.
    if (candidateReport.errors.length <= report.errors.length) {
      content = candidate;
      report = candidateReport;
    }
  }

  return { content, report, correctionRounds };
}
