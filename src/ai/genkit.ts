import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import * as fs from 'fs';
import * as path from 'path';

let dynamicKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

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

export const ai = genkit({
  plugins: [googleAI({ apiKey: dynamicKey })],
  model: 'googleai/gemini-2.5-flash',
});
