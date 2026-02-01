# AIKiosQ - Mac's Hardware Store Kiosk

## System Overview

AIKiosQ is a React + TypeScript kiosk application for hardware stores. It uses three Google Gemini models working together:

| Model | Purpose | Speed |
|-------|---------|-------|
| `gemini-2.5-flash-native-audio-preview-09-2025` | Real-time voice conversation via Live API | ~200ms latency |
| `gemini-3-flash-preview` | Deep part analysis with image input | 3-8 seconds |
| Mock JSON | Inventory lookup | Instant |

The AI persona is **"Mac"** — a veteran hardware store manager with 30 years of plumbing experience and a friendly, funny personality. Mac uses the native audio model's built-in voice (native audio models generate speech directly — no TTS voice config).

---

## Application Flow

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ 1. STARTUP                                                               │
 │    App mounts → loads inventory.json → user clicks ACTIVATE SENSORS      │
 │    Camera + mic permissions granted → motion detection loop starts        │
 └──────────────────────────┬───────────────────────────────────────────────┘
                            ↓
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ 2. MOTION DETECTION                                                      │
 │    Downsamples video to 64x48 → compares consecutive frames              │
 │    Pixel diff > MOTION_THRESHOLD (50) counted → total > TRIGGER_SCORE    │
 │    (200) → triggers connectToGemini()                                    │
 └──────────────────────────┬───────────────────────────────────────────────┘
                            ↓
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ 3. GEMINI LIVE SESSION                                                   │
 │    WebSocket to gemini-2.5-flash-native-audio-preview-09-2025            │
 │    Audio: 16kHz PCM in → 24kHz PCM out (native voice)                    │
 │    Mac greets customer immediately via system instruction                │
 └──────────────────────────┬───────────────────────────────────────────────┘
                            ↓
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ 4. TOOL-DRIVEN CONVERSATION                                             │
 │    Mac uses 3 tools to control the UI based on conversation:             │
 │                                                                          │
 │    analyze_part ──→ Snapshot capture → Gemini 3 analysis → instructions  │
 │    check_inventory ──→ Searches inventory.json → product cards           │
 │    show_aisle_sign ──→ Displays /Aisle N Sign.jpg                        │
 └──────────────────────────┬───────────────────────────────────────────────┘
                            ↓
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ 5. SESSION END                                                           │
 │    Mac: "Need anything else?" → User: "No thanks"                        │
 │    Live API onclose fires → scheduleReset() called                       │
 │    UI cleared → 60-second timer starts                                   │
 │    After 60s: disconnect Live API → re-enable motion detection           │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## Demo Scenario (Hackathon Script)

This is the target interaction for the Gemini 3 Hackathon demo:

1. **Kiosk is idle**, motion sensors active
2. **Customer approaches** → motion detected → Gemini Live connects
3. **Mac**: "How can I help you?"
4. **User**: "I want to replace this stuck water valve, but I've heard it requires a plumber due to leak issues. I want to do it myself."
5. **Mac**: "Can you show me the part more closely?"
6. **User** holds part closer to camera
7. **Mac**: "Let me get a closer look at that..." → calls `analyze_part` tool
8. **Screen**: Shows captured snapshot + spinning wheel while Gemini 3 analyzes
9. **Screen**: Displays snapshot with step-by-step replacement instructions below
10. **Mac**: "Can I show you a video on how compression fittings work?" → if yes, calls `play_compression_demo`
11. **Screen**: Plays video
12. **Mac**: "Do you want to know which aisle the valve can be found?" → calls `check_inventory` with "valve"
13. **Screen**: Shows inventory card — Aisle 5, 3 in stock, $16.99 + pipe thread tape $1.79
14. **Mac**: calls `show_aisle_sign` → Screen shows Aisle 5 Sign.jpg
15. **Mac**: "Do you need anything else?"
16. **User**: "No thanks"
17. **Kiosk resets** after 1-minute cooldown → ready for next customer

---

## File Structure

```
AIKiosq_r1/
├── index.html                          Entry HTML (Tailwind CDN, custom workshop CSS)
├── index.tsx                           React root
├── App.tsx                             Main controller (state, motion detection, callbacks)
├── types.ts                            Enums & interfaces
├── vite.config.ts                      Vite config (port 3000, API key injection)
├── tsconfig.json                       TypeScript config (ES2022, React JSX)
├── package.json                        Dependencies (react 19, @google/genai 1.38)
│
├── services/
│   ├── geminiService.ts                Live API service (Mac persona, 5 tools, audio/video streaming)
│   ├── gemini3AnalysisService.ts       Gemini 3 part analysis (image → instructions)
│   ├── inventoryService.ts             JSON inventory search
│   ├── leakAnalysisOrchestrator.ts     Multi-model orchestrator (future: Gemini 3 + Image Gen)
│   ├── audioUtils.ts                   PCM encode/decode, Base64 conversion
│   └── imageUtils.ts                   Blob to Base64 conversion
│
├── components/
│   ├── PlumbingThreadTeacher.tsx        Display component (8 stage views)
│   └── TestVideoPlayer.tsx             Dev test component
│
└── public/
    ├── inventory.json                  Mock inventory (8 items)
    ├── compression_demo.mp4            Installation demo video
    ├── Aisle 5 Sign.jpg                Aisle location photo
    ├── black-trap.jpg                  Sample plumbing images
    ├── sink-drain.jpg.png
    └── stuck valve.jpg
```

---

## Services

### GeminiLiveService (`services/geminiService.ts`)

The real-time conversation layer. Manages the WebSocket connection to Gemini 2.5 Live.

**Connection:**
- Model: `models/gemini-2.5-flash-native-audio-preview-09-2025`
- API version: `v1beta`
- Voice: Native (no TTS `speechConfig` — native audio models generate speech directly)
- Response modality: Audio only

**Audio Pipeline:**
```
Microphone → AudioContext (16kHz) → ScriptProcessor → PCM Blob → sendRealtimeInput()
Gemini → Base64 PCM (24kHz) → decodeAudioData() → AudioBufferSourceNode → Speaker
```

**Video Pipeline:** Disabled — background video streaming caused protocol conflicts (1008).

**Tools Declared:**

| Tool | Parameters | Handler |
|------|-----------|---------|
| `analyze_part` | `userQuestion: string` | Captures snapshot → calls Gemini3AnalysisService → returns results in tool response |
| `check_inventory` | `query: string` | Calls InventoryService.searchItems() → displays product cards |
| `show_aisle_sign` | `aisleName: string` | Extracts aisle number → displays /Aisle N Sign.jpg |

**Tool Response Flow:**
1. Live API sends `message.toolCall` with `functionCalls[]`
2. Handler matches `fc.name`, extracts args with type casts
3. Executes callback (async for analyze_part and check_inventory)
4. Sends `sendToolResponse()` back to Live API so Mac knows the action completed

**Session Lifecycle:**
- `onopen` → start audio/video streaming
- `onmessage` → handle audio output + tool calls
- `onerror` → update status display
- `onclose` → call `onSessionEnd` callback → triggers 1-minute reset timer

---

### Gemini3AnalysisService (`services/gemini3AnalysisService.ts`)

Deep analysis using the `@google/genai` SDK (non-Live, standard API).

**Model:** `gemini-3-flash-preview` (update when Gemini 3 launches)

**API Pattern:**
```typescript
const response = await this.ai.models.generateContent({
  model: this.modelName,
  contents: [
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
  ],
  config: { temperature: 0.4, maxOutputTokens: 1024 }
});
const text = response.text;
```

**Methods:**

`analyzePartForReplacement(imageBase64, userQuestion)` → `PartAnalysisResult`
- Sends image + structured prompt to Gemini 3
- Prompt requests: part identification, connection types, replacement steps, seal explanations, warnings
- Response is parsed via regex into `{ partName, instructions, warnings[] }`
- Temperature 0.4 for consistent technical output

`identifyPart(imageBase64)` → `string`
- Quick one-sentence identification
- maxOutputTokens: 256

---

### InventoryService (`services/inventoryService.ts`)

Client-side inventory search against a static JSON file.

**Data Source:** `/inventory.json` (loaded via fetch on mount)

**Search Logic:**
- Splits query into terms (3+ chars)
- Matches against: item name, description, category, keywords
- Returns all matching `InventoryItem[]`

**Complementary Items:**
- Valves → suggests tape + washers
- Compression fittings → suggests ferrules + tape

---

## UI Component: PlumbingThreadTeacher

Renders content based on `LessonStage` enum:

| Stage | What's Displayed |
|-------|-----------------|
| `IDLE` | "WORKSHOP MODE: STANDBY" with pulsing text |
| `COMPARE_THREADS` | SVG diagram — NPT tapered vs compression threads |
| `HIGHLIGHT_FERRULE` | Same diagram with animated ferrule highlight + "SEAL POINT" label |
| `PLAYING_VIDEO` | Video player (local MP4 or Google Drive iframe) with muted-then-unmute autoplay |
| `ANALYZING_PART` | Spinning wheel + "Mac is examining your part..." |
| `SHOWING_ANALYSIS` | Captured snapshot image + part name + numbered instructions + red warning box |
| `SHOWING_INVENTORY` | Product cards with name, description, price, aisle, stock count |
| `SHOWING_AISLE` | Full-screen aisle sign photo with fallback SVG if image missing |

---

## State Management (App.tsx)

All state lives in the App component via `useState`:

| State | Type | Purpose |
|-------|------|---------|
| `stage` | `LessonStage` | Current display mode |
| `status` | `string` | Status bar text |
| `isConnected` | `boolean` | Live API session active |
| `isMonitoring` | `boolean` | Motion detection active |
| `videoUrl` | `string?` | Current video source path |
| `partAnalysis` | `PartAnalysis?` | Gemini 3 analysis result |
| `inventoryItems` | `InventoryItem[]` | Inventory search results |
| `aisleSignPath` | `string?` | Aisle sign image path |

**Refs:**
- `videoRef` — camera `<video>` element
- `streamRef` — MediaStream for camera + mic
- `previousFrameRef` — last frame for motion diff
- `resetTimeoutRef` — 60-second reset timer handle

---

## Callback Chain

When Gemini Live calls a tool, the data flows:

```
Gemini Live API
  → geminiService.ts (onmessage → toolCall handler)
    → App.tsx callback (e.g. handleAnalyzePart)
      → Service call (e.g. Gemini3AnalysisService.analyzePartForReplacement)
        → setState updates
          → PlumbingThreadTeacher re-renders with new stage + data
```

For `analyze_part` specifically:

```
1. Mac calls analyze_part(userQuestion)
2. geminiService.ts → handleAnalyzePart() → callbacks.onAnalyzePart('', userQuestion)
3. App.tsx handleAnalyzePart():
   a. setStage(ANALYZING_PART) → spinner shows
   b. liveService.captureSnapshot(stream) → high-res JPEG
   c. analysisService.analyzePartForReplacement(snapshot, question)
   d. setPartAnalysis(result + snapshot) → instructions show
   e. setStage(SHOWING_ANALYSIS)
4. geminiService.ts sends tool response back to Live API
5. Mac verbally summarizes the findings
```

---

## Environment

- **API Key:** `GEMINI_API_KEY` in `.env.local` (injected by Vite as `process.env.API_KEY`)
- **Dev Server:** `npm run dev` → localhost:3000
- **Build:** `npm run build` → dist/
- **Permissions:** Camera + Microphone (requires HTTPS in production or localhost for dev)

---

## Troubleshooting
- If you have an error with the AI model like Error 1008, please consult https://discuss.ai.google.dev/c/gemini-api/4 for answers; Specifically https://discuss.ai.google.dev/t/gemini-live-api-websocket-error-1008-operation-is-not-implemented-or-supported-or-enabled/114644

| Problem | Cause | Fix |
|---------|-------|-----|
| Error 1008 causes onclose | Bug in *-12-25 model | Use `gemini-2.5-flash-native-audio-preview-09-2025` |
| No audio from Mac | AudioContext suspended | Click page first, or check speaker volume |
| Motion never triggers | Threshold too high | Lower `TRIGGER_SCORE` in App.tsx |
| Gemini 3 analysis fails | Model not available yet | Update model name in gemini3AnalysisService.ts when released |
| Aisle sign shows blue square | Image file missing | Add `Aisle N Sign.jpg` to public/ (fallback SVG is intentional) |
| Video won't autoplay | Browser policy | Component uses muted-then-unmute strategy; click page first if needed |
| Reset timer not firing | Session still open | Timer triggers on Live API `onclose` event |

---

## Known Issues: Native Audio Model 1008 Disconnects

The `gemini-2.5-flash-native-audio-preview-12-2025` model has a bug where it disconnects with WebSocket close code **1008** ("Operation is not implemented, or supported, or enabled") shortly after connecting. The server sends text tokens successfully but crashes when delivering the first audio chunk.

**Working model:** `gemini-2.5-flash-native-audio-preview-09-2025`
**Broken model:** `gemini-2.5-flash-native-audio-preview-12-2025` (and the `-latest` alias)

### Things that do NOT fix the 1008 on the broken model
- Removing `speechConfig` / `prebuiltVoiceConfig` (Puck voice)
- Removing `realtimeInputConfig` / `ActivityHandling`
- Switching `sendRealtimeInput` from `media` to `audio` field
- Removing the `sendRealtimeInput({ text })` nudge
- Removing explicit `responseModalities`

### Things to avoid with native audio models
- **No `speechConfig`**: Native audio models generate speech directly and do not support TTS voice selection (`prebuiltVoiceConfig`). Omit `speechConfig` entirely.
- **No `sendRealtimeInput({ text })`**: The SDK's `sendRealtimeInput` only accepts `audio`, `video`, and `media` fields. Passing `{ text }` sends an empty/malformed WebSocket message.
- **No `sendClientContent` during audio**: Calling `sendClientContent` while the model is generating audio can cause 1008. Use `sendRealtimeInput` for continuous input and return tool results via `sendToolResponse`.
- **No background video streaming**: Sending video frames via `sendRealtimeInput({ media })` during audio sessions causes protocol conflicts.
