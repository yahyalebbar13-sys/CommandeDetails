'use server';
/**
 * @fileOverview Genkit flow for generating a complete Moroccan market study
 * for a given logistics product category.
 * Uses the same pattern as suggest-article-specifications-flow.ts
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// ── Output schema ─────────────────────────────────────────────────────────────

const RiskSchema = z.object({
  type: z.string(),
  level: z.enum(['Faible', 'Modéré', 'Élevé']),
  description: z.string(),
});

const ClientSegmentSchema = z.object({
  segment: z.string(),
  percentage: z.number(),
  description: z.string(),
});

const CompetitorSchema = z.object({
  name: z.string(),
  type: z.enum(['Local', 'Importé']),
  estimatedMarketShare: z.string(),
  pricePositioning: z.string(),
});

const SeasonalityMonthSchema = z.object({
  month: z.string(),
  demandIndex: z.number(),
});

const CategoryMarketStudyOutputSchema = z.object({
  executiveSummary: z.string(),
  technicalSpecs: z.array(z.string()),
  requiredComponents: z.array(z.string()),
  moroccanUseCases: z.array(z.string()),
  competitors: z.array(CompetitorSchema),
  avgPurchasePriceAnalysis: z.string(),
  recommendedSellingPriceMAD: z.number(),
  recommendedSellingPriceContext: z.string(),
  minimumImportQuantity: z.number(),
  minimumImportQuantityUnit: z.string(),
  idealOrderQuantity: z.number(),
  idealOrderQuantityUnit: z.string(),
  idealOrderQuantityRationale: z.string(),
  replenishmentFrequencyDays: z.number(),
  replenishmentFrequencyRationale: z.string(),
  risks: z.array(RiskSchema),
  clientSegments: z.array(ClientSegmentSchema),
  seasonality: z.array(SeasonalityMonthSchema),
  keyInsights: z.array(z.string()),
  marketSizeEstimateMAD: z.number().optional(),
  growthTrendPercent: z.number().optional(),
});
export type CategoryMarketStudyOutput = z.infer<typeof CategoryMarketStudyOutputSchema>;

// ── Input schema — single string to avoid Handlebars issues ──────────────────

const CategoryMarketStudyInputSchema = z.object({
  promptText: z.string().describe('Full pre-built prompt text for the market study.'),
});

// ── Types exported for use in the UI ─────────────────────────────────────────

export interface CategoryMarketStudyInput {
  categoryName: string;
  avgPurchasePriceUsd?: number;
  totalQuantityOrdered?: number;
  suppliersUsed?: string[];
  unitOfMeasure?: string;
}

// ── Prompt definition ─────────────────────────────────────────────────────────

const categoryMarketStudyPrompt = ai.definePrompt({
  name: 'categoryMarketStudyPrompt',
  input: { schema: CategoryMarketStudyInputSchema },
  output: { schema: CategoryMarketStudyOutputSchema },
  prompt: `{{{promptText}}}`,
});

// ── Flow definition ───────────────────────────────────────────────────────────

const categoryMarketStudyFlow = ai.defineFlow(
  {
    name: 'categoryMarketStudyFlow',
    inputSchema: CategoryMarketStudyInputSchema,
    outputSchema: CategoryMarketStudyOutputSchema,
  },
  async (input) => {
    const { output } = await categoryMarketStudyPrompt(input);
    if (!output) {
      throw new Error('No output received from the AI model.');
    }
    return output;
  }
);

// ── Public function ───────────────────────────────────────────────────────────

export async function generateCategoryMarketStudy(
  input: CategoryMarketStudyInput
): Promise<CategoryMarketStudyOutput> {
  // Build the full prompt as a plain string — no Handlebars issues
  const lines: string[] = [
    `Tu es un expert en commerce international, en importation de fournitures industrielles et de mercerie, et en analyse de marché au Maroc.`,
    `Tu travailles pour un importateur logistique spécialisé dans les accessoires de confection textile (fermetures éclair, boutons, fils, tissus, etc.).`,
    ``,
    `Génère une étude de marché complète et professionnelle pour la catégorie suivante dans le contexte marocain :`,
    ``,
    `Catégorie : ${input.categoryName}`,
  ];

  if (input.avgPurchasePriceUsd != null) {
    lines.push(`Prix d'achat moyen actuel : ${input.avgPurchasePriceUsd} USD/${input.unitOfMeasure || 'u'}`);
  }
  if (input.totalQuantityOrdered != null) {
    lines.push(`Quantité totale commandée historiquement : ${input.totalQuantityOrdered} ${input.unitOfMeasure || 'u'}`);
  }
  if (input.suppliersUsed && input.suppliersUsed.length > 0) {
    lines.push(`Fournisseurs utilisés : ${input.suppliersUsed.join(', ')}`);
  }

  lines.push(
    ``,
    `Réponds UNIQUEMENT avec un objet JSON valide respectant le schéma de sortie. Toutes les descriptions et analyses doivent être en français.`,
    ``,
    `Contraintes importantes :`,
    `- seasonality : exactement 12 objets avec les clés "month" (Janv, Févr, Mars, Avr, Mai, Juin, Juil, Août, Sept, Oct, Nov, Déc) et "demandIndex" (nombre entre 0 et 100).`,
    `- clientSegments : la somme de tous les "percentage" doit être exactement 100.`,
    `- risks : au minimum 4 risques couvrant : variation des prix matières, qualité fournisseur, délais de livraison, saisonnalité.`,
    `- Tous les chiffres doivent être réalistes pour le marché marocain de la confection textile (Casablanca, Fès, Tanger, Marrakech).`,
    `- marketSizeEstimateMAD et growthTrendPercent sont optionnels mais recommandés.`,
  );

  const promptText = lines.join('\n');

  return categoryMarketStudyFlow({ promptText });
}
