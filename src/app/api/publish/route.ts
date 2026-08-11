import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
    
    if (!deployHookUrl) {
      return NextResponse.json(
        { error: "Configuration manquante: VERCEL_DEPLOY_HOOK_URL n'est pas défini dans les variables d'environnement." },
        { status: 500 }
      );
    }

    if (!deployHookUrl.startsWith('http')) {
      return NextResponse.json(
        { error: "Configuration invalide: l'URL VERCEL_DEPLOY_HOOK_URL ne commence pas par http." },
        { status: 500 }
      );
    }

    const res = await fetch(deployHookUrl, {
      method: 'POST',
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'pas de détails');
      return NextResponse.json(
        { error: `Vercel a refusé la requête (${res.status}): ${errorText}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Déploiement lancé avec succès !" });
  } catch (error: any) {
    console.error('Publish error:', error);
    return NextResponse.json(
      { error: "Erreur interne: " + error.message },
      { status: 500 }
    );
  }
}
