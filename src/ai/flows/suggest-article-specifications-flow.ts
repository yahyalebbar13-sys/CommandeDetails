'use server';
/**
 * @fileOverview This file defines a Genkit flow for suggesting technical specifications for an article.
 *
 * - suggestArticleSpecifications - A function that leverages AI to suggest technical specifications for a given article.
 * - SuggestArticleSpecificationsInput - The input type for the suggestArticleSpecifications function.
 * - SuggestArticleSpecificationsOutput - The return type for the suggestArticleSpecifications function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestArticleSpecificationsInputSchema = z.object({
  category: z.string().describe('The category of the article (e.g., "Zipper No5", "Sewing Thread").'),
  article: z.string().describe('The name of the article (e.g., "NO.5 NYGURADE ZIPPER", "Sewing Thread 40/2").'),
});
export type SuggestArticleSpecificationsInput = z.infer<typeof SuggestArticleSpecificationsInputSchema>;

const SuggestArticleSpecificationsOutputSchema = z.object({
  specs: z.string().describe('The suggested technical specifications for the article (e.g., "12cm SEMI AUTO", "60g+39g").'),
});
export type SuggestArticleSpecificationsOutput = z.infer<typeof SuggestArticleSpecificationsOutputSchema>;

export async function suggestArticleSpecifications(input: SuggestArticleSpecificationsInput): Promise<SuggestArticleSpecificationsOutput> {
  return suggestArticleSpecificationsFlow(input);
}

const suggestArticleSpecificationsPrompt = ai.definePrompt({
  name: 'suggestArticleSpecificationsPrompt',
  input: {schema: SuggestArticleSpecificationsInputSchema},
  output: {schema: SuggestArticleSpecificationsOutputSchema},
  prompt: `You are an expert in product specifications for various manufacturing items and textile components.
Given an item's category and name, your task is to suggest a concise and typical technical specification (specs) for that item.
The output should be a single, short string containing only the suggested specification, without any additional explanations, greetings, or formatting.
Focus on common or essential technical attributes.

For example:
If Category is "Zipper No5" and Article is "NO.5 NYGURADE ZIPPER", a good suggestion could be "12cm SEMI AUTO".
If Category is "Sewing Thread" and Article is "Sewing Thread 40/2", a good suggestion could be "60g+39g".
If Category is "Non Woven Interlining" and Article is "NON WOVEN INTERLINING 1050HF", a good suggestion could be "100Y/ROLL".

Category: {{{category}}}
Article: {{{article}}}`,
});

const suggestArticleSpecificationsFlow = ai.defineFlow(
  {
    name: 'suggestArticleSpecificationsFlow',
    inputSchema: SuggestArticleSpecificationsInputSchema,
    outputSchema: SuggestArticleSpecificationsOutputSchema,
  },
  async (input) => {
    const {output} = await suggestArticleSpecificationsPrompt(input);
    if (!output) {
      throw new Error('No output received from the AI model.');
    }
    return output;
  }
);
