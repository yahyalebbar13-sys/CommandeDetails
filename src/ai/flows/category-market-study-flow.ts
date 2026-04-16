'use server';
/**
 * @fileOverview Genkit flow for generating a complete Moroccan market study
 * for a given logistics product category.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// ── Input ─────────────────────────────────────────────────────────────────────

const CategoryMarketStudyInputSchema = z.object({
  categoryName: z.string().describe('Name of the product category (e.g. "NO5 NYLON ZIPPER", "Snap Button", "Non Woven Interlining").'),
  avgPurchasePriceUsd: z.number().optional().describe('Average purchase price per unit in USD from the user data.'),
  totalQuantityOrdered: z.number().optional().describe('Total quantity ordered historically.'),
  suppliersUsed: z.array(z.string()).optional().describe('List of supplier IDs or names used for this category.'),
  unitOfMeasure: z.string().optional().describe('Unit of measure (e.g. kg, pcs, yard).'),
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
  demandIndex: z.number().describe('Demand index from 0 to 100'),
});

const CategoryMarketStudyOutputSchema = z.object({
  executiveSummary: z.string().describe('Short executive summary of the market study in French.'),
  technicalSpecs: z.array(z.string()).describe('Key technical characteristics of this product category.'),
  requiredComponents: z.array(z.string()).describe('Components or raw materials needed to make/use this product.'),
  moroccanUseCases: z.array(z.string()).describe('Main usage scenarios for this product in Morocco.'),
  competitors: z.array(CompetitorSchema).describe('Main competitors, local and imported.'),
  avgPurchasePriceAnalysis: z.string().describe('Analysis of purchase price, context, and benchmark in French.'),
  recommendedSellingPriceMAD: z.number().describe('Recommended selling price in MAD.'),
  recommendedSellingPriceContext: z.string().describe('Explanation of the recommended selling price.'),
  minimumImportQuantity: z.number().describe('Minimum viable import quantity.'),
  minimumImportQuantityUnit: z.string(),
  idealOrderQuantity: z.number().describe('Ideal recommended quantity for next purchase order.'),
  idealOrderQuantityUnit: z.string(),
  idealOrderQuantityRationale: z.string().describe('Why this quantity is ideal.'),
  replenishmentFrequencyDays: z.number().describe('Recommended replenishment frequency in days.'),
  replenishmentFrequencyRationale: z.string(),
  risks: z.array(RiskSchema).describe('Risk analysis covering price, quality, delay, seasonality.'),
  clientSegments: z.array(ClientSegmentSchema).describe('Client segmentation in Morocco with estimated percentages.'),
  seasonality: z.array(SeasonalityMonthSchema).describe('Monthly demand index throughout the year (12 months).'),
  keyInsights: z.array(z.string()).describe('3-5 key strategic insights for the buyer.'),
  marketSizeEstimateMAD: z.number().optional().describe('Estimated annual Moroccan market size in MAD.'),
  growthTrendPercent: z.number().optional().describe('Estimated annual market growth rate in %.'),
});
export type CategoryMarketStudyOutput = z.infer<typeof CategoryMarketStudyOutputSchema>;

// ── Flow ──────────────────────────────────────────────────────────────────────

export async function generateCategoryMarketStudy(input: CategoryMarketStudyInput): Promise<CategoryMarketStudyOutput> {
  return categoryMarketStudyFlow(input);
}

const categoryMarketStudyPrompt = ai.definePrompt({
  name: 'categoryMarketStudyPrompt',
  input: { schema: CategoryMarketStudyInputSchema },
  output: { schema: CategoryMarketStudyOutputSchema },
  prompt: `Tu es un expert en commerce international, en importation de fournitures industrielles et de mercerie, et en analyse de marché au Maroc. Tu travailles pour un importateur logistique marocain spécialisé dans les accessoires de confection textile (fermetures éclair, boutons, fils, tissus, etc.).

Génère une étude de marché complète et professionnelle pour la catégorie de produit suivante, dans le contexte du marché marocain :

**Catégorie :** {{{categoryName}}}
{{#if avgPurchasePriceUsd}}**Prix d'achat moyen actuel :** {{{avgPurchasePriceUsd}}} USD/unité{{/if}}
{{#if totalQuantityOrdered}}**Quantité totale commandée historiquement :** {{{totalQuantityOrdered}}} {{{unitOfMeasure}}}{{/if}}
{{#if suppliersUsed}}**Fournisseurs utilisés :** {{{suppliersUsed}}}{{/if}}

Réponds UNIQUEMENT avec un objet JSON valide respectant le schéma de sortie. Toutes les descriptions et analyses doivent être en français. Les données chiffrées doivent être réalistes et cohérentes avec le marché marocain de la confection textile (Casablanca, Fès, Marrakech, Tanger, etc.).

Pour la saisonnalité, fournis exactement 12 entrées : Janv, Févr, Mars, Avr, Mai, Juin, Juil, Août, Sept, Oct, Nov, Déc — chaque demandIndex entre 0 et 100.
Pour les clientSegments, la somme des pourcentages doit être égale à 100.
Pour les risks, inclus au minimum : prix (variation des matières), qualité (contrôle fournisseur), délai (lead time), saisonnalité (variations de demande).
`,
});

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
