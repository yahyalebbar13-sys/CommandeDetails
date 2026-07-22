import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

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

    const dataString = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1,
      }
    });

    // Utilisation de https.request pour contourner le rejet SSL de l'antivirus (rejectUnauthorized: false)
    const response = await new Promise<any>((resolve, reject) => {
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataString)
        },
        rejectUnauthorized: false // C'est CA qui permet de passer l'antivirus
      };

      const request = https.request(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
        options,
        (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(body));
            } else {
              reject(new Error(`API Error: ${res.statusCode} - ${body}`));
            }
          });
        }
      );
      
      request.on('error', reject);
      request.write(dataString);
      request.end();
    });

    const resultText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    
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
