import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin if not already initialized
function getFirebaseAdminApp() {
  if (!getApps().length) {
    try {
      return initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    } catch (error) {
      console.error('Firebase admin initialization error', error);
      return null;
    }
  }
  return getApps()[0];
}

export async function POST(req: Request) {
  try {
    const app = getFirebaseAdminApp();
    if (!app) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const body = await req.json();
    const { action, email, password, uid } = body;

    if (!action || (!email && !uid)) {
      return NextResponse.json({ error: 'Action and email/uid are required' }, { status: 400 });
    }

    const auth = getAuth(app);

    if (action === 'CREATE') {
      if (!password || !email) {
        return NextResponse.json({ error: 'Email and password required for creation' }, { status: 400 });
      }
      try {
        const userRecord = await auth.createUser({
          email,
          password,
        });
        return NextResponse.json({ success: true, uid: userRecord.uid });
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } 
    
    else if (action === 'UPDATE_PASSWORD') {
      if (!password || (!uid && !email)) {
        return NextResponse.json({ error: 'UID/email and new password are required' }, { status: 400 });
      }
      try {
        let targetUid = uid;
        if (!targetUid && email) {
          const userRecord = await auth.getUserByEmail(email);
          targetUid = userRecord.uid;
        }
        await auth.updateUser(targetUid, { password });
        return NextResponse.json({ success: true });
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    
    else if (action === 'DELETE') {
      if (!uid && !email) {
        return NextResponse.json({ error: 'UID or email is required for deletion' }, { status: 400 });
      }
      try {
        let targetUid = uid;
        if (!targetUid && email) {
          const userRecord = await auth.getUserByEmail(email);
          targetUid = userRecord.uid;
        }
        await auth.deleteUser(targetUid);
        return NextResponse.json({ success: true });
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    
    else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
