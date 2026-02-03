/**
 * Gemini 3 Analysis Service
 *
 * Uses Gemini 3 Flash for deep analysis of plumbing parts
 * Returns step-by-step instructions for replacement/repair
 */

import { GoogleGenAI } from '@google/genai';

export interface PartAnalysisResult {
  partName: string;
  instructions: string;
  //warnings: string[];
}

export class Gemini3AnalysisService {
  private ai: GoogleGenAI;
  private modelName = 'gemini-3-flash-preview';

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Analyze a plumbing part image and return replacement instructions
   */
  async analyzePartForReplacement(imageBase64: string, userQuestion: string): Promise<PartAnalysisResult> {
    const prompt = `You are Mac, a veteran hardware store manager with 30 years of plumbing experience.

The customer is asking: "${userQuestion}"

Analyze the plumbing part in this image and provide:

1. Identify what type of part this is (valve, fitting, trap, etc.)
2. Identify the pipe connection types visible (compression, NPT threaded, slip joint, etc.)
3. Provide SHORT, QUICK step-by-step instructions to replace this part


Keep your response concise and practical. Use bullet points. Write like a friendly veteran who's done this a thousand times.

Format your response as:
PART: [name of part]

INSTRUCTIONS:
[numbered steps]`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64
            }
          }
        ],
        config: {
          temperature: 1.0,
          maxOutputTokens: 1024,
          thinkingConfig: {
      // @ts-expect-error — thinkingLevel supported by API but not yet in SDK types
      thinkingLevel: 'MINIMAL',
    },
        }
      });

      const text = response.text ?? '';

      // Parse the response
      const partMatch = text.match(/PART:\s*(.+?)(?:\n|$)/i);
      const instructionsMatch = text.match(/INSTRUCTIONS:\s*([\s\S]+?)(?=WARNINGS:|$)/i);
      //const warningsMatch = text.match(/WARNINGS:\s*([\s\S]+?)$/i);

      return {
        partName: partMatch?.[1]?.trim() || 'Plumbing Component',
        instructions: instructionsMatch?.[1]?.trim() || text,
        //warnings: warningsMatch?.[1]?.trim().split('\n').filter(w => w.trim()) || []
      };

    } catch (error) {
      console.error('Gemini 3 analysis error:', error);
      throw new Error('Failed to analyze part. Please try again.');
    }
  }

  /**
   * Simple part identification (no detailed instructions)
   */
  async identifyPart(imageBase64: string): Promise<string> {
    const prompt = `You are Mac, a veteran hardware store manager.

Look at this plumbing part and identify what it is in ONE SHORT SENTENCE.
Example: "That's a quarter-turn angle stop valve with compression fittings."

Be brief and casual.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64
            }
          }
        ],
        config: {
          temperature: 0.4,
          maxOutputTokens: 256,
        }
      });

      return (response.text ?? 'a plumbing component').trim();

    } catch (error) {
      console.error('Part identification error:', error);
      return 'a plumbing component';
    }
  }
}
