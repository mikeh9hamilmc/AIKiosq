import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { createPcmBlob, decode, decodeAudioData } from './audioUtils';
import { blobToBase64 } from './imageUtils';
import { LessonStage } from '../types';

interface LiveServiceCallbacks {
  onStageChange: (stage: LessonStage) => void;
  onStatusChange: (status: string) => void;
  onAnalyzePart: (imageBase64: string, userQuestion: string) => Promise<string>;
  onCheckInventory: (query: string) => Promise<void>;
  onShowAisleSign: (aisleName: string) => void;
  onSessionEnd: () => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private sessionPromise: Promise<any> | null = null;
  private videoIntervalId: number | null = null;
  private isPaused = false; // Only used during tool calls to prevent mic noise during countdown/analysis

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  }

  public async disconnect() {
    if (this.videoIntervalId) {
      window.clearInterval(this.videoIntervalId);
      this.videoIntervalId = null;
    }
    if (this.inputAudioContext) await this.inputAudioContext.close();
    if (this.outputAudioContext) await this.outputAudioContext.close();
    this.inputAudioContext = null;
    this.outputAudioContext = null;
  }

  public async sendInfoToSession(text: string) {
    this.sessionPromise?.then((session) => {
      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text }]
          }
        ],
        turnComplete: true
      });
    });
  }

  public resumeInput() {
    console.log("Manually resuming media streams");
    this.isPaused = false;
  }

  /**
   * Stop all queued audio playback (used when user interrupts / barge-in).
   */
  private stopAllAudio() {
    this.sources.forEach(source => {
      try { source.stop(); } catch (_) { /* already stopped */ }
    });
    this.sources.clear();
    if (this.outputAudioContext) {
      this.nextStartTime = this.outputAudioContext.currentTime;
    }
  }

  public async start(callbacks: LiveServiceCallbacks, stream: MediaStream) {
    this.isPaused = false;

    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    // Tool: Analyze Part
    const analyzePartTool: FunctionDeclaration = {
      name: 'analyze_part',
      description: 'Captures a high-resolution photo of the plumbing part the customer is showing and analyzes it with Gemini 3 to provide detailed replacement instructions.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          userQuestion: {
            type: Type.STRING,
            description: 'The customer\'s question or what they want to know about the part (e.g., "how to replace this valve")',
          },
        },
        required: ['userQuestion'],
      },
    };

    // Tool: Check Inventory
    const checkInventoryTool: FunctionDeclaration = {
      name: 'check_inventory',
      description: 'Searches the store inventory for a specific part or product.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'What to search for (e.g., "valve", "teflon tape", "compression fitting")',
          },
        },
        required: ['query'],
      },
    };

    // Tool: Show Aisle Sign
    const showAisleSignTool: FunctionDeclaration = {
      name: 'show_aisle_sign',
      description: 'Displays a photo of the aisle sign to help the customer locate the product.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          aisleName: {
            type: Type.STRING,
            description: 'The aisle name (e.g., "Aisle 5 - Undersink Repair")',
          },
        },
        required: ['aisleName'],
      },
    };

    const inputNode = this.inputAudioContext.createGain();
    const outputNode = this.outputAudioContext.createGain();
    outputNode.connect(this.outputAudioContext.destination);

    try {
      callbacks.onStatusChange('Connecting to Gemini...');
      const modelName = 'models/gemini-2.5-flash-native-audio-preview-09-2025';
      console.log("Connecting to model:", modelName);

      this.sessionPromise = this.ai.live.connect({
        model: modelName,
        callbacks: {
          onopen: () => {
            callbacks.onStatusChange('Connected: AI Assistant Active');

            if (!this.inputAudioContext) return;
            const source = this.inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              // Only pause mic during tool calls (countdown/analysis). The Live API
              // handles VAD and barge-in natively — no manual half-duplex needed.
              if (this.isPaused) return;

              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);

              this.sessionPromise?.then((session) => {
                if (this.isPaused) return;
                session.sendRealtimeInput({ audio: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(this.inputAudioContext.destination);
            // this.startVideoStreaming(stream); // DISABLED: Background video causes protocol conflicts (1008)
            // Greeting is handled by the system instruction ("greet immediately").
          },
          onmessage: async (message: LiveServerMessage) => {
            const hasAudio = !!message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            const hasText = !!message.serverContent?.modelTurn?.parts?.some((p: any) => p.text);
            const keys = Object.keys(message).join(',');
            console.log(`[GeminiService] Msg keys=[${keys}] ToolCall=${!!message.toolCall} Audio=${hasAudio} Text=${hasText} Interrupted=${!!message.serverContent?.interrupted} TurnComplete=${!!message.serverContent?.turnComplete}`);

            // Handle barge-in: when the user interrupts Mac, clear the audio queue
            if (message.serverContent?.interrupted) {
              console.log("[GeminiService] User interrupted — clearing audio queue");
              this.stopAllAudio();
            }

            if (message.serverContent?.turnComplete) {
              console.log("[GeminiService] Server turnComplete");
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                this.outputAudioContext,
                24000,
                1
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              source.addEventListener('ended', () => this.sources.delete(source));
              source.start(this.nextStartTime);
              this.nextStartTime += audioBuffer.duration;
              this.sources.add(source);
            }

            if (message.toolCall) {
              console.log("Pausing media streams for tool execution");
              this.isPaused = true;

              for (const fc of message.toolCall.functionCalls) {
                console.log("Tool Call: ", fc.name, fc.args);
                if (fc.name === 'analyze_part') {
                  const userQuestion = (fc.args?.userQuestion as string) || 'how to replace this part';
                  this.handleAnalyzePart(fc.id, userQuestion, callbacks);
                } else if (fc.name === 'check_inventory') {
                  const query = (fc.args?.query as string) || '';
                  this.handleCheckInventory(fc.id, query, callbacks);
                } else if (fc.name === 'show_aisle_sign') {
                  const aisleName = (fc.args?.aisleName as string) || 'Aisle 5 - Undersink Repair';
                  callbacks.onShowAisleSign(aisleName);
                  this.sendToolResponse(fc.id, fc.name, { result: 'aisle_sign_displayed' });
                }
              }
            }
          },
          onerror: (e) => {
            console.error("Gemini Live Error:", e);
            callbacks.onStatusChange(`Error: ${e.message || 'Unknown error'}`);
          },
          onclose: (e: any) => {
            console.error("Gemini Live Disconnected", e);
            console.error(`[GeminiService] Close Details - Code: ${e.code}, Reason: ${e.reason}, WasClean: ${e.wasClean}`);
            callbacks.onStatusChange(`Disconnected (Code: ${e?.code}, Reason: ${e?.reason})`);
            callbacks.onSessionEnd();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
          systemInstruction: `You are "Mac," a veteran hardware store manager with 30 years of plumbing experience and a friendly, funny personality. You work at a modern hardware store kiosk helping customers with plumbing problems.

Your Style:
- Give helpful SHORT answers unless the customer asks for more details
- Be casual and friendly, like an experienced friend helping out
- Use a bit of humor when appropriate, but stay professional
- Keep responses brief and to the point

Your Workflow:

1. GREETING: Immediately greet the customer warmly and ask how you can help. Start speaking right away.

2. PART IDENTIFICATION: When a customer wants to replace a part:
   - Ask them to show you the part up close to the camera
   - CALL THE TOOL "analyze_part" with their question (e.g., userQuestion: "how to replace this valve")

3. INVENTORY HELP: After explaining how to fix something:
   - Offer to check inventory: "Do you want me to check if we have that in inventory?"
   - If yes, CALL THE TOOL "check_inventory" with what they need (e.g., query: "valve")
   - After getting results, offer to show them which aisle its in by CALLING "show_aisle_sign"

4. CLOSING: Always ask "Need anything else?" before ending the conversation.

Remember: Be brief, helpful, and friendly. You're Mac - the guy everyone goes to for plumbing advice!
          `,
          tools: [{ functionDeclarations: [analyzePartTool, checkInventoryTool, showAisleSignTool] }]
          // Note: VAD and barge-in are enabled by default on the Live API.
          // Explicit realtimeInputConfig omitted — the preview model may not support it.
        }
      });
      await this.sessionPromise;
    } catch (e: any) {
      console.error("Connection Exception:", e);
      callbacks.onStatusChange(`Connection Failed: ${e.message}`);
    }
  }

  private sendToolResponse(id: string, name: string, response: any, autoResume = true) {
    const payload = {
      functionResponses: [{
        id: id,
        name: name,
        response: response
      }]
    };
    console.log(`[GeminiService] Sending Tool Response for ${name} (${id}):`, JSON.stringify(payload, null, 2));

    this.sessionPromise?.then((session) => {
      session.sendToolResponse(payload);

      if (autoResume) {
        // Resume media streaming after response is sent
        setTimeout(() => {
          console.log("Resuming media streams (auto)");
          this.isPaused = false;
        }, 200);
      }
    });
  }

  private startVideoStreaming(stream: MediaStream) {
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const offscreenVideo = document.createElement('video');
    offscreenVideo.autoplay = true;
    offscreenVideo.playsInline = true;
    offscreenVideo.muted = true;
    offscreenVideo.srcObject = stream;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    offscreenVideo.onloadedmetadata = () => {
      offscreenVideo.play();
      canvas.width = offscreenVideo.videoWidth * 0.5;
      canvas.height = offscreenVideo.videoHeight * 0.5;

      this.videoIntervalId = window.setInterval(async () => {
        if (!this.sessionPromise || !ctx || this.isPaused) return;

        ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (blob) {
            const base64Data = await blobToBase64(blob);
            this.sessionPromise?.then(session => {
              session.sendRealtimeInput({
                media: { mimeType: 'image/jpeg', data: base64Data }
              });
            });
          }
        }, 'image/jpeg', 0.6);
      }, 1000);
    };
  }

  /**
   * Capture a high-resolution snapshot from the video stream
   */
  public async captureSnapshot(stream: MediaStream): Promise<string> {
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('No video track available');

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;

      video.onloadedmetadata = () => {
        video.play();

        // Wait a bit for the video to stabilize
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(video, 0, 0);

          canvas.toBlob(async (blob) => {
            if (blob) {
              const base64Data = await blobToBase64(blob);
              resolve(base64Data);
            } else {
              reject(new Error('Failed to create blob'));
            }
          }, 'image/jpeg', 0.95); // High quality for analysis
        }, 200);
      };

      video.onerror = () => reject(new Error('Video loading failed'));
    });
  }

  /**
   * Handle analyze_part tool call.
   * Waits for the full analysis to complete, then sends the results
   * in the tool response. This avoids using sendClientContent during
   * an active audio session, which causes 1008 on native audio models.
   */
  private async handleAnalyzePart(
    callId: string,
    userQuestion: string,
    callbacks: LiveServiceCallbacks
  ) {
    try {
      const resultText = await callbacks.onAnalyzePart('', userQuestion);
      this.sendToolResponse(callId, 'analyze_part', { result: resultText });
    } catch (error) {
      console.error('Analyze part error:', error);
      this.sendToolResponse(callId, 'analyze_part', { result: 'Analysis failed. Please ask the customer to try again.' });
    }
  }

  /**
   * Handle check_inventory tool call
   */
  private async handleCheckInventory(
    callId: string,
    query: string,
    callbacks: LiveServiceCallbacks
  ) {
    try {
      await callbacks.onCheckInventory(query);
      this.sendToolResponse(callId, 'check_inventory', { result: 'Inventory checked and displayed.' });
    } catch (error) {
      console.error('Check inventory error:', error);
      this.sendToolResponse(callId, 'check_inventory', { result: 'Error: Inventory check failed.' });
    }
  }
}