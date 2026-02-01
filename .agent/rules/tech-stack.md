---
trigger: always_on
---

# Tech Stack & Interaction Rules

## AI Architecture

### Gemini 2.5 (Voice/Live)
- **Model**: `gemini-2.5-flash-native-audio-preview-09-2025`
- **Role**: Real-time conversational interface, session management, tool invocation.
- **Protocol**: WebSocket via Live API.
- **Constraints**: 
  - Native audio generation (no TTS config).
  - No background video streaming (prevents 1008 errors).
  - Audio input/output only.

### Gemini 3 (Vision/Deep Reasoning)
- **Model**: `gemini-3-flash-preview`
- **Role**: On-demand deep analysis, vision interpretation, structured data extraction.
- **Protocol**: Stateless unary calls (REST/gRPC via SDK).
- **Latency**: High (3-8s).

## Interaction Rules (The "Handshake")

1. **Trigger & Pause**
   - Gemini 2.5 detects intent to analyze text/image and calls the `analyze_part` tool.
   - **Rule**: Audio input *must* be paused/ignored during analysis to prevent race conditions or double-triggers.

2. **Visual Handoff**
   - A high-resolution snapshot is captured from the client video stream.
   - **Rule**: Live streaming of video to Gemini 2.5 is *disabled*. Vision is handled exclusively by passing static snapshots to Gemini 3.

3. **Async Analysis**
   - The snapshot is sent to Gemini 3 with a specific system instruction (e.g., "Identify this plumbing part...").
   - Gemini 2.5 waits (pending tool execution). Client UI displays "Thinking/Analyzing" state.

4. **Synthesis & Resume**
   - Gemini 3 returns structured text/JSON.
   - Result is fed back to Gemini 2.5 as the tool output.
   - Gemini 2.5 synthesizes the natural language response to the user.