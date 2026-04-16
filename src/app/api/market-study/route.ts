import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

function getApiKey() {
  let dynamicKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!dynamicKey) {
    try {
      const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
      const match = envContent.match(/GEMINI_API_KEY=([^\r\n]+)/);
      if (match && match[1]) {
        dynamicKey = match[1].trim();
      }
    } catch (e) {
      // Ignore
    }
  }
  return dynamicKey;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("Clé API Gemini introuvable. Veuillez vérifier .env.local.");
    }

    const { categoryName, avgPurchasePriceUsd, totalQuantityOrdered, suppliersUsed, unitOfMeasure } = await request.json();

    const lines: string[] = [
      `Tu es expert en commerce international et importation de fournitures au Maroc (textile).`,
      `Génère une étude de marché complète pour :`,
      `Catégorie : ${categoryName}`,
    ];

    if (avgPurchasePriceUsd != null) lines.push(`Prix d'achat moyen : ${avgPurchasePriceUsd} USD/${unitOfMeasure || 'u'}`);
    if (totalQuantityOrdered != null) lines.push(`Quantité commandée historiquement : ${totalQuantityOrdered} ${unitOfMeasure || 'u'}`);
    if (suppliersUsed?.length > 0) lines.push(`Fournisseurs : ${suppliersUsed.join(', ')}`);

    lines.push(
      ``,
      `Retourne UNIQUEMENT un objet JSON valide (sans markdown) avec cette structure :`,
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
      `Contraintes : seasonality exactement 12 mois, clientSegments somme = 100, risks minimum 4. Chiffres réalistes.`
    );

    const promptText = lines.join('\n');

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || "Erreur lors de l'appel à l'API Gemini");
    }

    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOutput) {
      throw new Error("Réponse vide de Gemini");
    }

    let jsonText = textOutput.trim();
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
