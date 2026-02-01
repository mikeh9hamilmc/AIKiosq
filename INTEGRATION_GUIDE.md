# Leak Analysis Integration Guide

## Overview
This guide shows how to add Gemini 3-powered leak analysis to your AIKiosQ project using the orchestration architecture:
- **Gemini 2.5 Live**: Real-time conversation (fast)
- **Gemini 3**: Deep analysis with tool calling (smart)
- **Gemini 2.5 Flash Image**: Visual annotation (creative)

## Step 1: Update geminiService.ts

Add the new `analyze_leak_points` tool to the function declarations:

```typescript
// Add this new tool after playVideoTool (around line 58)
const analyzeLeakPointsTool: FunctionDeclaration = {
  name: 'analyze_leak_points',
  description: 'Capture a snapshot of the plumbing assembly and perform deep analysis to identify and mark potential leak points with visual annotations',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};
```

Then update the tools array to include it:

```typescript
// Change line 155 from:
tools: [{ functionDeclarations: [setStageTool, playVideoTool] }]

// To:
tools: [{ functionDeclarations: [setStageTool, playVideoTool, analyzeLeakPointsTool] }]
```

## Step 2: Update System Instruction

Update the system instruction (around line 135) to mention the new capability:

```typescript
systemInstruction: `You are a plumbing store assistant with advanced diagnostic capabilities.

When you see a customer looking at you, ask how you can help.

If the customer says they have a leak or wants you to check for potential problems:
- Ask them to hold the assembly up to the camera
- Say: "Let me take a closer look and analyze this for leak points"
- CALL THE TOOL "analyze_leak_points"

If you see a compression fitting (brass ring/ferrule, nut, body):
   - Say: "I see you have a compression fitting. Would you like to see how to install it?"
   - If they say yes, CALL THE TOOL "play_compression_demo".

If you see a standard threaded pipe (NPT):
   - Say: "That looks like a standard NPT thread. Let me show you the difference."
   - CALL THE TOOL "show_npt_diagram".

Speak briefly and clearly. Be helpful and proactive.
`,
```

## Step 3: Add Callback Interface

Update the `LiveServiceCallbacks` interface (around line 6):

```typescript
interface LiveServiceCallbacks {
  onStageChange: (stage: LessonStage) => void;
  onStatusChange: (status: string) => void;
  onPlayCompressionDemo: () => void;
  onAnalyzeLeakPoints: () => Promise<void>; // NEW
}
```

## Step 4: Handle Tool Call in geminiService.ts

Add handler in the `onmessage` callback (around line 116):

```typescript
if (message.toolCall) {
  for (const fc of message.toolCall.functionCalls) {
    if (fc.name === 'show_npt_diagram') {
      callbacks.onStageChange(LessonStage.COMPARE_THREADS);
      this.sendToolResponse(fc.id, fc.name, { result: 'diagram_displayed' });
    } else if (fc.name === 'play_compression_demo') {
      callbacks.onPlayCompressionDemo();
      this.sendToolResponse(fc.id, fc.name, { result: 'video_started' });
    } else if (fc.name === 'analyze_leak_points') {
      // NEW HANDLER
      callbacks.onStatusChange('🔍 Analyzing assembly with Gemini 3...');
      await callbacks.onAnalyzeLeakPoints();
      this.sendToolResponse(fc.id, fc.name, { result: 'analysis_complete' });
    }
  }
}
```

## Step 5: Add Method to Capture Snapshot

Add this public method to `GeminiLiveService` class:

```typescript
/**
 * Capture current video frame as base64 JPEG
 */
public async captureSnapshot(stream: MediaStream): Promise<string> {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) throw new Error('No video track available');

  const offscreenVideo = document.createElement('video');
  offscreenVideo.autoplay = true;
  offscreenVideo.srcObject = stream;

  // Wait for video to be ready
  await new Promise<void>((resolve) => {
    offscreenVideo.onloadedmetadata = () => {
      offscreenVideo.play();
      resolve();
    };
  });

  // Wait a bit for frame to render
  await new Promise(resolve => setTimeout(resolve, 100));

  const canvas = document.createElement('canvas');
  canvas.width = offscreenVideo.videoWidth;
  canvas.height = offscreenVideo.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.drawImage(offscreenVideo, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        blobToBase64(blob).then(resolve);
      }
    }, 'image/jpeg', 0.95); // High quality for analysis
  });
}
```

## Step 6: Add New Lesson Stage

Update [types.ts](d:\Dev\AIKiosq_r1\types.ts):

```typescript
export enum LessonStage {
  IDLE = 'IDLE',
  COMPARE_THREADS = 'COMPARE_THREADS',
  PLAYING_VIDEO = 'PLAYING_VIDEO',
  ANALYZING = 'ANALYZING',           // NEW
  SHOWING_ANALYSIS = 'SHOWING_ANALYSIS' // NEW
}
```

## Step 7: Update App.tsx

Add state for annotated image and orchestrator:

```typescript
import { LeakAnalysisOrchestrator } from './services/leakAnalysisOrchestrator';

// Inside App component
const [annotatedImage, setAnnotatedImage] = useState<string | null>(null);
const [analysisResult, setAnalysisResult] = useState<any>(null);
const [orchestrator] = useState(() => new LeakAnalysisOrchestrator(process.env.API_KEY!));
```

Add the callback handler:

```typescript
const handleAnalyzeLeakPoints = async () => {
  if (!streamRef.current) return;

  try {
    setStage(LessonStage.ANALYZING);
    setStatus('📸 Capturing snapshot...');

    // Capture high-res snapshot
    const snapshot = await liveService.captureSnapshot(streamRef.current);

    setStatus('🧠 Gemini 3 analyzing for leak points...');

    // Orchestrate Gemini 3 + Image Gen
    const result = await orchestrator.analyzeAndAnnotate(snapshot);

    setAnalysisResult(result);
    setAnnotatedImage(result.annotatedImageBase64);
    setStage(LessonStage.SHOWING_ANALYSIS);
    setStatus(`✅ Analysis Complete - ${result.leakPoints.length} potential issues found`);

    console.log('Leak Points:', result.leakPoints);
    console.log('Recommendations:', result.recommendations);

  } catch (error) {
    console.error('Analysis failed:', error);
    setStatus('❌ Analysis failed - please try again');
  }
};
```

Update the connectToGemini callback:

```typescript
const connectToGemini = useCallback(async () => {
  if (!streamRef.current) return;
  setIsConnected(true);
  setIsMonitoring(false);

  await liveService.start({
    onStageChange: (newStage) => setStage(newStage),
    onStatusChange: (newStatus) => setStatus(newStatus),
    onPlayCompressionDemo: () => {
      setVideoUrl(COMPRESSION_VIDEO_PATH);
      setStage(LessonStage.PLAYING_VIDEO);
      setStatus("PLAYING DEMO: COMPRESSION FITTING");
    },
    onAnalyzeLeakPoints: handleAnalyzeLeakPoints // NEW
  }, streamRef.current);
}, [liveService, handleAnalyzeLeakPoints]);
```

## Step 8: Update PlumbingThreadTeacher Component

Add new display mode for analysis results. Pass these props:

```typescript
<PlumbingThreadTeacher
  stage={stage}
  videoUrl={videoUrl}
  annotatedImage={annotatedImage} // NEW
  analysisResult={analysisResult}  // NEW
/>
```

Inside the component, add rendering for analysis stage:

```typescript
// In PlumbingThreadTeacher.tsx
if (stage === LessonStage.SHOWING_ANALYSIS && props.annotatedImage) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 p-8">
      <h2 className="text-4xl font-bold text-red-500 mb-6">
        ⚠️ LEAK POINT ANALYSIS
      </h2>

      {/* Annotated Image */}
      <img
        src={`data:image/jpeg;base64,${props.annotatedImage}`}
        alt="Annotated assembly"
        className="max-w-4xl max-h-[60vh] rounded-lg shadow-2xl mb-6"
      />

      {/* Recommendations */}
      {props.analysisResult?.recommendations && (
        <div className="bg-yellow-900 border-4 border-yellow-500 rounded-lg p-6 max-w-4xl">
          <h3 className="text-2xl font-bold text-yellow-300 mb-4">
            📋 RECOMMENDATIONS:
          </h3>
          <ul className="text-xl text-yellow-100 space-y-2">
            {props.analysisResult.recommendations.map((rec: string, i: number) => (
              <li key={i}>✓ {rec}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-gray-400 mt-6 text-lg">
        Analysis powered by Gemini 3 + Gemini 2.5 Flash Image
      </p>
    </div>
  );
}
```

## Step 9: Install Dependencies & Update Model Names

When Gemini 3 is available, update the model name in `leakAnalysisOrchestrator.ts`:

```typescript
// Change from:
model: 'gemini-3-flash'

// To the actual model name when released, likely:
model: 'models/gemini-3-flash-latest'
// or
model: 'models/gemini-3-pro-latest'
```

## Testing Flow

1. Start the kiosk
2. User approaches (motion detected)
3. AI: "How can I help you?"
4. User: "Can you check this assembly for leaks?"
5. AI: "Sure! Hold it up to the camera. Let me analyze it..."
6. **AI calls `analyze_leak_points` tool**
7. System captures snapshot
8. Gemini 3 analyzes → identifies leak points
9. Gemini 2.5 Flash Image adds arrows/labels
10. Annotated image displayed with recommendations
11. AI verbally explains findings

## Why This Wins the Hackathon

✅ **Uses Gemini 3** (required)
✅ **Three-model orchestration** (not a simple chatbot)
✅ **Tool calling** (autonomous agent behavior)
✅ **Real-Time Teacher track** (perfect alignment)
✅ **Multimodal** (audio + video → annotated images)
✅ **Practical application** (real retail problem)
✅ **Novel combination** (no one else will have this exact stack)

## Next Enhancements

- Add 1M context with plumbing codes (load PDF manuals)
- Multi-step diagnosis with follow-up questions
- Thought signature display showing AI reasoning
- Cost estimation tool
- Parts compatibility checker
