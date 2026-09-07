import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleAuth } from 'google-auth-library';

dotenv.config({ path: '.env.local' });

async function deployRules() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-9506506653-9b525';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    console.error('Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY in .env.local');
    process.exit(1);
  }

  const auth = new GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
  });

  const client = await auth.getClient();
  const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');

  console.log(`Creating ruleset for project ${projectId}...`);
  const createRulesetUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
  const createRes = await client.request({
    url: createRulesetUrl,
    method: 'POST',
    data: {
      source: {
        files: [
          {
            name: 'firestore.rules',
            content: rulesContent,
          },
        ],
      },
    },
  });

  const rulesetName = createRes.data.name;
  console.log(`Ruleset created: ${rulesetName}`);

  console.log('Releasing ruleset to cloud.firestore...');
  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`;
  const releaseRes = await client.request({
    url: releaseUrl,
    method: 'PATCH',
    data: {
      release: {
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName: rulesetName,
      },
    },
  });

  console.log('Rules release updated successfully!', releaseRes.data);
}

deployRules().catch(err => {
  console.error('Deploy failed:', err.response?.data || err.message);
  process.exit(1);
});
