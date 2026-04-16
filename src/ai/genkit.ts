
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {firebaseConfig} from '@/firebase/config';

export const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || firebaseConfig.apiKey })],
  model: 'googleai/gemini-2.5-flash',
});
