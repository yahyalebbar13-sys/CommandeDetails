import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `Tu es un assistant IA spécialisé dans l'analyse d'emails de logistique, d'import, et de transit pour l'entreprise StockVue.
Ton objectif est de lire un email et d'extraire des données structurées.

Analyse l'email fourni et retourne UNIQUEMENT un objet JSON avec la structure suivante :
{
  "typeAction": "string", // "DUM_RECUE", "COMMANDE_CONFIRMEE", "DOCUMENTS_TRANSIT", ou "AUTRE"
  "dossierId": "string", // Le numéro du dossier s'il est mentionné (ex: 10426HT1004). Si non trouvé, null.
  "dateMentionnee": "string", // La date principale mentionnée (ex: date de remise, date d'arrivée). Si non trouvé, null.
  "fournisseur": "string", // Le nom du fournisseur ou de l'expéditeur si identifiable.
  "resume": "string", // Un résumé clair de l'email en 1 phrase courte.
  "actionSuggeree": "string" // Ce qu'il faut faire dans StockVue (ex: "Cocher remis au transitaire").
}`;

export async function POST(req: NextRequest) {
  try {
    const { subject, text, from } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Clé API Gemini manquante' }, { status: 500 });
    }

    const prompt = `Email de: ${from}\nSujet: ${subject}\n\nContenu:\n${text}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1,
          }
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erreur Gemini API:', errText);
      return NextResponse.json({ error: 'Erreur lors de l\'analyse IA' }, { status: 500 });
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      return NextResponse.json({ error: 'Réponse vide de l\'IA' }, { status: 500 });
    }

    const parsedJson = JSON.parse(resultText);
    return NextResponse.json(parsedJson);

  } catch (err: any) {
    console.error('[Analyze Email Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
