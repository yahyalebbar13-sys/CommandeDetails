'use server';
/**
 * @fileOverview Genkit flow for generating a complete Moroccan market study
 * for a given logistics product category.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// ── Input ─────────────────────────────────────────────────────────────────────

const CategoryMarketStudyInputSchema = z.object({
  categoryName: z.string().describe('Name of the product category.'),
  avgPurchasePriceUsd: z.number().optional(),
  totalQuantityOrdered: z.number().optional(),
  suppliersUsed: z.array(z.string()).optional(),
  unitOfMeasure: z.string().optional(),
});
export type CategoryMarketStudyInput = z.infer<typeof CategoryMarketStudyInputSchema>;

// ── Output ────────────────────────────────────────────────────────────────────

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

// ── Flow ──────────────────────────────────────────────────────────────────────

export async function generateCategoryMarketStudy(input: CategoryMarketStudyInput): Promise<CategoryMarketStudyOutput> {
  // Build the prompt string dynamically to avoid Handlebars array/conditional issues
  const lines: string[] = [];
  lines.push(`Tu es un expert en commerce international et en importation de fournitures industrielles (mercerie, textile, accessoires de confection) au Maroc.`);
  lines.push(`Génère une étude de marché complète et professionnelle pour la catégorie suivante dans le contexte marocain :\n`);
  lines.push(`Catégorie : ${input.categoryName}`);
  if (input.avgPurchasePriceUsd != null) lines.push(`Prix d'achat moyen actuel : ${input.avgPurchasePriceUsd} USD/${input.unitOfMeasure || 'u'}`);
  if (input.totalQuantityOrdered != null) lines.push(`Quantité totale commandée historiquement : ${input.totalQuantityOrdered} ${input.unitOfMeasure || 'u'}`);
  if (input.suppliersUsed && input.suppliersUsed.length > 0) lines.push(`Fournisseurs utilisés : ${input.suppliersUsed.join(', ')}`);
  lines.push(`\nRéponds UNIQUEMENT avec un objet JSON valide respectant le schéma de sortie. Toutes les descriptions et analyses doivent être en français.`);
  lines.push(`\nContraintes :`);
  lines.push(`- Pour la saisonnalité : fournis exactement 12 entrées (Janv, Févr, Mars, Avr, Mai, Juin, Juil, Août, Sept, Oct, Nov, Déc), chaque demandIndex entre 0 et 100.`);
  lines.push(`- Pour clientSegments : la somme des pourcentages doit être égale à 100.`);
  lines.push(`- Pour risks : inclus au minimum les risques prix, qualité, délai, saisonnalité.`);
  lines.push(`- Les données chiffrées doivent être réalistes pour le marché marocain de la confection textile (Casablanca, Fès, Tanger, Marrakech).`);

  const prompt = lines.join('\n');

  const result = await ai.generate({
    prompt,
    output: { schema: CategoryMarketStudyOutputSchema },
  });

  if (!result.output) {
    throw new Error('No output received from the AI model.');
  }
  return result.output;
}
