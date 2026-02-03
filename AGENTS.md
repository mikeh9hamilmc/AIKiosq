# AIKiosQ - Mac's Hardware Store Kiosk

## System Overview

AIKiosQ is a React + TypeScript kiosk application for hardware stores. It uses three Google Gemini models working together:

| Model | Purpose | Speed |
|-------|---------|-------|
| `gemini-2.5-flash-native-audio-preview-09-2025` | Real-time voice conversation via Live API (Puck voice) | ~200ms latency |
| `gemini-3-flash-preview` | Deep part analysis with image input | 3-8 seconds |
| Mock JSON | Inventory lookup | Instant |

The AI persona is **"Mac"** — a veteran hardware store manager with 30 years of plumbing experience and a friendly, funny personality. Mac uses the Puck voice via `speechConfig`.

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
 │    Audio: 16kHz PCM in → 24kHz PCM out (Puck voice)                      │
 │    Mac greets customer via sendClientContent nudge in onopen              │
 │    Inactivity timer (60s) starts — resets on every server message         │
 └──────────────────────────┬───────────────────────────────────────────────┘
                            ↓
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ 4. TOOL-DRIVEN CONVERSATION                                             │
 │    Mac uses 3 tools to control the UI based on conversation:             │
 │                                                                          │
 │    analyze_part ──→ Snapshot → Gemini 3 analysis → asks before explain   │
 │    check_inventory ──→ Searches inventory.json → returns actual results  │
 │    show_aisle_sign ──→ Displays /Aisle N Sign.jpg                        │
 │                                                                          │
 │    Conversation flow after analysis:                                     │
 │    1. Mac tells customer what part was identified                         │
 │    2. Asks "Want replacement instructions?" → explains if yes            │
 │    3. Asks "Want me to check inventory?" → searches if yes               │
 │    4. Mac ONLY reports what the tool returns (never fabricates)           │
 └──────────────────────────┬───────────────────────────────────────────────┘
                            ↓
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ 5. SESSION END / AUTO-RESET                                             │
 │    Option A: Mac: "Need anything else?" → User: "No thanks" → onclose   │
 │    Option B: 60s inactivity (no server messages) → auto-disconnect       │
 │    Either path → onclose → scheduleReset():                              │
 │      - Disconnects Live API, clears all display state                    │
 │      - Clears previousFrameRef (prevents false motion trigger)           │
 │      - Re-enables B&W motion detection monitoring immediately            │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## Demo Scenario (Hackathon Script)

This is the target interaction for the Gemini 3 Hackathon demo:

1. **Kiosk is idle**, B&W motion detection active, "WAITING FOR NEW CUSTOMER"
2. **Customer approaches** → motion detected → Gemini Live connects
3. **Mac** greets customer automatically (nudged via `sendClientContent` on connect)
4. **User**: "I want to replace this stuck water valve"
5. **Mac**: "Can you show me the part up close?"
6. **User** holds part closer to camera
7. **Mac**: "Let me get a closer look..." → calls `analyze_part` tool
8. **Screen**: Spinning wheel while Gemini 3 analyzes → then snapshot + part name
9. **Mac**: "That's a 1/2 inch compression valve. Want instructions on how to replace it?"
10. **User**: "Yes" → Mac explains replacement steps verbally (no text on screen)
11. **Mac**: "Want me to check if we have that in stock?"
12. **User**: "Yes" → Mac calls `check_inventory` with "valve"
13. **Screen**: Inventory cards — if found, Mac reports items + Aisle 5; if not found, Mac says "sorry, we don't carry that"
14. **Mac**: calls `show_aisle_sign` → Screen shows Aisle 5 Sign.jpg
15. **Mac**: "Need anything else?"
16. **User**: "No thanks"
17. **60 seconds of inactivity** → auto-disconnect → kiosk resets to B&W monitoring

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
    └── stuck valve.jpg
```

---

## Services

### GeminiLiveService (`services/geminiService.ts`)

The real-time conversation layer. Manages the WebSocket connection to Gemini 2.5 Live.

**Connection:**
- Model: `models/gemini-2.5-flash-native-audio-preview-09-2025`
- API version: `v1beta`
- Voice: Puck (via `speechConfig.voiceConfig.prebuiltVoiceConfig`)
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
| `check_inventory` | `query: string` | Calls InventoryService.searchItems() → returns actual results (or "no items found") to Mac → displays product cards |
| `show_aisle_sign` | `aisleName: string` | Extracts aisle number → displays /Aisle N Sign.jpg |

**Tool Response Flow:**
1. Live API sends `message.toolCall` with `functionCalls[]`
2. Handler matches `fc.name`, extracts args with type casts
3. Executes callback (async for analyze_part and check_inventory)
4. Sends `sendToolResponse()` back to Live API so Mac knows the action completed

**Inactivity Timer:**
- 60-second timer resets on every `onmessage` from the server
- On expiry: calls `disconnect()` → `session.close()` → triggers `onclose` → `scheduleReset`
- `disconnect()` also resets `nextStartTime = 0` and clears `sources` Set to prevent stale audio scheduling on reconnect

**Session Lifecycle:**
- `onopen` → start audio streaming, start inactivity timer, send greeting nudge via `sendClientContent`
- `onmessage` → handle audio output + tool calls, reset inactivity timer
- `onerror` → update status display
- `onclose` → call `onSessionEnd` callback → `scheduleReset` clears all state and re-enables monitoring

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
- Prompt requests: part identification, connection types, replacement steps, seal explanations
- Response is parsed via regex into `{ partName, instructions }`
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
| `SHOWING_ANALYSIS` | Captured snapshot image + part name (Mac explains verbally — no text instructions on screen) |
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
- `previousFrameRef` is set to `null` on reset to ensure the motion detection loop captures a fresh baseline before triggering

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
5. Mac tells the customer what part it is, then asks if they want replacement instructions
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
| Mac silent after reset | `nextStartTime` not reset | Fixed: `disconnect()` resets `nextStartTime = 0` and clears `sources` |
| False motion on reset | Stale `previousFrameRef` | Fixed: cleared to `null` in `scheduleReset` before re-enabling monitoring |
| Mac fabricates inventory | Tool response was generic | Fixed: `handleCheckInventory` returns actual results or "no items found" to Mac |

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
- **No `sendRealtimeInput({ text })`**: The SDK's `sendRealtimeInput` only accepts `audio`, `video`, and `media` fields. Passing `{ text }` sends an empty/malformed WebSocket message.
- **No `sendClientContent` during audio**: Calling `sendClientContent` while the model is generating audio can cause 1008. The greeting nudge is safe because it fires in `onopen` before audio generation starts.
- **No background video streaming**: Sending video frames via `sendRealtimeInput({ media })` during audio sessions causes protocol conflicts.
