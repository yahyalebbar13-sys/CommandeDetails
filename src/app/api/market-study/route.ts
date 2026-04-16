import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Simple input/output schema — text in, text out, we parse manually
const InputSchema = z.object({ promptText: z.string() });
const OutputSchema = z.object({ text: z.string() });

const marketStudyPrompt = ai.definePrompt({
  name: 'marketStudyRawPrompt',
  input: { schema: InputSchema },
  output: { schema: OutputSchema },
  prompt: `{{{promptText}}}`,
});

const marketStudyFlow = ai.defineFlow(
  {
    name: 'marketStudyRawFlow',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  },
  async (input) => {
    const { output } = await marketStudyPrompt(input);
    if (!output) throw new Error('No output from AI');
    return output;
  }
);

export async function POST(request: NextRequest) {
  try {
    const { categoryName, avgPurchasePriceUsd, totalQuantityOrdered, suppliersUsed, unitOfMeasure } = await request.json();

    const lines: string[] = [
      `Tu es un expert en commerce international et en importation de fournitures industrielles au Maroc (confection textile : fermetures éclair, boutons, fils, tissus, accessoires).`,
      ``,
      `Génère une étude de marché complète pour :`,
      `Catégorie : ${categoryName}`,
    ];

    if (avgPurchasePriceUsd != null) lines.push(`Prix d'achat moyen : ${avgPurchasePriceUsd} USD/${unitOfMeasure || 'u'}`);
    if (totalQuantityOrdered != null) lines.push(`Quantité commandée historiquement : ${totalQuantityOrdered} ${unitOfMeasure || 'u'}`);
    if (suppliersUsed?.length > 0) lines.push(`Fournisseurs : ${suppliersUsed.join(', ')}`);

    lines.push(
      ``,
      `Retourne UNIQUEMENT un objet JSON valide (sans markdown, sans code blocks, juste le JSON brut) avec cette structure exacte :`,
      `{`,
      `  "executiveSummary": "string",`,
      `  "technicalSpecs": ["string", ...],`,
      `  "requiredComponents": ["string", ...],`,
      `  "moroccanUseCases": ["string", ...],`,
      `  "competitors": [{"name":"string","type":"Local ou Importe","estimatedMarketShare":"string","pricePositioning":"string"}, ...],`,
      `  "avgPurchasePriceAnalysis": "string",`,
      `  "recommendedSellingPriceMAD": number,`,
      `  "recommendedSellingPriceContext": "string",`,
      `  "minimumImportQuantity": number,`,
      `  "minimumImportQuantityUnit": "string",`,
      `  "idealOrderQuantity": number,`,
      `  "idealOrderQuantityUnit": "string",`,
      `  "idealOrderQuantityRationale": "string",`,
      `  "replenishmentFrequencyDays": number,`,
      `  "replenishmentFrequencyRationale": "string",`,
      `  "risks": [{"type":"string","level":"Faible ou Modere ou Eleve","description":"string"}, ...],`,
      `  "clientSegments": [{"segment":"string","percentage":number,"description":"string"}, ...],`,
      `  "seasonality": [`,
      `    {"month":"Janv","demandIndex":number},{"month":"Fevr","demandIndex":number},{"month":"Mars","demandIndex":number},`,
      `    {"month":"Avr","demandIndex":number},{"month":"Mai","demandIndex":number},{"month":"Juin","demandIndex":number},`,
      `    {"month":"Juil","demandIndex":number},{"month":"Aout","demandIndex":number},{"month":"Sept","demandIndex":number},`,
      `    {"month":"Oct","demandIndex":number},{"month":"Nov","demandIndex":number},{"month":"Dec","demandIndex":number}`,
      `  ],`,
      `  "keyInsights": ["string", ...],`,
      `  "marketSizeEstimateMAD": number,`,
      `  "growthTrendPercent": number`,
      `}`,
      ``,
      `Contraintes : seasonality exactement 12 mois, clientSegments somme = 100, risks minimum 4, toutes les descriptions en français, chiffres réalistes pour le marché marocain.`,
    );

    const promptText = lines.join('\n');

    const result = await marketStudyFlow({ promptText });

    // Parse the raw text as JSON
    let jsonText = result.text.trim();
    // Remove markdown code blocks if the model adds them anyway
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

    const study = JSON.parse(jsonText);

    return NextResponse.json({ success: true, study });
  } catch (error: any) {
    console.error('[market-study API] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
