import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
    
    if (!deployHookUrl) {
      return NextResponse.json(
        { error: "Le lien de déploiement Vercel n'est pas configuré." },
        { status: 500 }
      );
    }

    const res = await fetch(deployHookUrl, {
      method: 'POST',
    });

    if (!res.ok) {
      throw new Error(`Erreur lors du déclenchement du déploiement: ${res.statusText}`);
    }

    return NextResponse.json({ success: true, message: "Déploiement lancé avec succès !" });
  } catch (error: any) {
    console.error('Publish error:', error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors du lancement de la publication." },
      { status: 500 }
    );
  }
}
