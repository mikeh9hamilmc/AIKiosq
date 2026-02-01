/**
 * Leak Analysis Orchestrator
 *
 * Orchestrates three Gemini models for plumbing leak point analysis:
 * 1. Gemini 2.5 Live - Real-time conversation
 * 2. Gemini 3 - Deep analysis with tool calling
 * 3. Gemini 2.5 Flash Image - Visual annotation
 */

import { GoogleGenerativeAI } from '@google/genai';

interface LeakPoint {
  x: number; // percentage from left (0-100)
  y: number; // percentage from top (0-100)
  severity: 'high' | 'medium' | 'low';
  reason: string;
  label: string;
}

interface AnalysisResult {
  leakPoints: LeakPoint[];
  overallAssessment: string;
  recommendations: string[];
  thinkingProcess: string[];
  annotatedImageBase64: string; // Final annotated image
}

export class LeakAnalysisOrchestrator {
  private genAI: GoogleGenerativeAI;
  private gemini3Model: any;
  private imageGenModel: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);

    // Gemini 3 for deep analysis with tool calling
    this.gemini3Model = this.genAI.getGenerativeModel({
      model: 'gemini-3-flash', // Use gemini-3-pro for even deeper thinking
      tools: [{
        functionDeclarations: [
          {
            name: 'mark_leak_point',
            description: 'Identify and mark a specific potential leak point on the plumbing assembly',
            parameters: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate as percentage from left edge (0-100)'
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate as percentage from top edge (0-100)'
                },
                severity: {
                  type: 'string',
                  enum: ['high', 'medium', 'low'],
                  description: 'Risk level of leak at this point'
                },
                reason: {
                  type: 'string',
                  description: 'Technical explanation (e.g., "Ferrule backwards", "Cross-threaded", "Insufficient Teflon tape")'
                },
                label: {
                  type: 'string',
                  description: 'Short label for annotation (max 4-5 words)'
                }
              },
              required: ['x', 'y', 'severity', 'reason', 'label']
            }
          }
        ]
      }]
    });

    // Gemini 2.5 Flash Image for visual annotation
    this.imageGenModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-image'
    });
  }

  /**
   * Main orchestration method: Analyze snapshot and return annotated image
   */
  async analyzeAndAnnotate(snapshotBase64: string): Promise<AnalysisResult> {
    console.log('🔍 Step 1: Starting Gemini 3 deep analysis...');

    // STEP 1: Gemini 3 analyzes and identifies leak points via tool calling
    const analysisPrompt = `You are an expert plumbing inspector. Analyze this photo of a plumbing assembly for potential leak points.

For EACH potential leak point you identify:
1. Determine its precise location as x,y coordinates (percentage from left and top)
2. Assess severity (high/medium/low)
3. Explain the technical reason it could leak
4. Create a short label for display

Call mark_leak_point for every potential leak point you find.

Common issues to check:
- Thread type mismatches (NPT vs compression)
- Ferrule orientation (backwards = leak)
- Teflon tape (missing on NPT, present on compression = both leak)
- Overtightening or undertightening
- Cross-threading
- Damaged or deformed components
- Pipe burrs or poor preparation

Be thorough and precise with coordinates.`;

    const analysisResult = await this.gemini3Model.generateContent([
      analysisPrompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: snapshotBase64
        }
      }
    ]);

    // Parse Gemini 3 response
    const leakPoints: LeakPoint[] = [];
    const thinkingProcess: string[] = [];

    const response = await analysisResult.response;

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        // Capture thinking/reasoning
        if (part.text) {
          thinkingProcess.push(part.text);
        }

        // Extract leak points from tool calls
        if (part.functionCall?.name === 'mark_leak_point') {
          leakPoints.push({
            x: part.functionCall.args.x,
            y: part.functionCall.args.y,
            severity: part.functionCall.args.severity,
            reason: part.functionCall.args.reason,
            label: part.functionCall.args.label
          });
        }
      }
    }

    console.log(`✅ Gemini 3 identified ${leakPoints.length} potential leak points`);

    // STEP 2: Generate overall assessment
    const overallAssessment = thinkingProcess.join(' ') || 'Analysis complete.';
    const recommendations = this.generateRecommendations(leakPoints);

    // STEP 3: Use Gemini 2.5 Flash Image to annotate the image
    console.log('🎨 Step 2: Generating annotated image with gemini-2.5-flash-image...');

    const annotationPrompt = this.buildAnnotationPrompt(leakPoints);

    const imageResult = await this.imageGenModel.generateContent([
      annotationPrompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: snapshotBase64
        }
      }
    ]);

    // Extract annotated image
    let annotatedImageBase64 = '';
    const imageResponse = await imageResult.response;

    if (imageResponse.candidates?.[0]?.content?.parts) {
      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData?.mimeType.startsWith('image/')) {
          annotatedImageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    console.log('✅ Annotation complete!');

    return {
      leakPoints,
      overallAssessment,
      recommendations,
      thinkingProcess,
      annotatedImageBase64
    };
  }

  /**
   * Build prompt for Gemini 2.5 Flash Image to add annotations
   */
  private buildAnnotationPrompt(leakPoints: LeakPoint[]): string {
    if (leakPoints.length === 0) {
      return 'This plumbing assembly looks correct. Add a green checkmark overlay with text "No leak points detected - Assembly looks good!"';
    }

    let prompt = 'Edit this image to add clear visual annotations for a hardware store kiosk display:\n\n';

    leakPoints.forEach((point, index) => {
      const color = point.severity === 'high' ? 'red' : point.severity === 'medium' ? 'orange' : 'yellow';

      prompt += `${index + 1}. Draw a bold ${color} arrow pointing to the location at approximately ${point.x}% from the left edge and ${point.y}% from the top edge. `;
      prompt += `Next to the arrow, add a ${color} text box with the label: "${point.label}"\n`;
    });

    prompt += '\nMake arrows thick and clear. Use bold, sans-serif font at least 24px. Ensure text is readable from 6 feet away on a kiosk screen. Keep the original image fully visible behind the annotations.';

    return prompt;
  }

  /**
   * Generate actionable recommendations based on leak points
   */
  private generateRecommendations(leakPoints: LeakPoint[]): string[] {
    if (leakPoints.length === 0) {
      return ['Assembly looks properly configured. Proceed with installation.'];
    }

    const recommendations: string[] = [];
    const issues = leakPoints.map(p => p.reason.toLowerCase());

    if (issues.some(i => i.includes('ferrule') && i.includes('backward'))) {
      recommendations.push('Reinstall ferrule with tapered end facing the fitting body');
    }
    if (issues.some(i => i.includes('teflon') || i.includes('tape'))) {
      recommendations.push('Apply 3-4 wraps of white Teflon tape in clockwise direction on NPT threads only');
    }
    if (issues.some(i => i.includes('tighten'))) {
      recommendations.push('Hand-tighten compression fittings, then add 1-1.5 turns with wrench (no more)');
    }
    if (issues.some(i => i.includes('thread') && i.includes('mismatch'))) {
      recommendations.push('Use consistent fitting types - do not mix NPT and compression on same connection');
    }
    if (issues.some(i => i.includes('cross'))) {
      recommendations.push('Disassemble and realign threads carefully - cross-threading causes permanent damage');
    }

    return recommendations;
  }
}
