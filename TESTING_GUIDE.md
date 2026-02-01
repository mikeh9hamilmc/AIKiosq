# Quick Testing Guide

## Before You Start

1. **Add Aisle Sign Image** (Required)
   - Create or find a photo of an aisle sign
   - Save it as `public/Aisle 5 Sign.jpg`
   - Or use a placeholder image

2. **Update Model Name** (When Gemini 3 is released)
   - Edit `services/gemini3AnalysisService.ts` line 23
   - Change `'gemini-3-flash-preview'` to actual model name

## Test Scenario

Follow this script to test all features:

### Step 1: Start the Kiosk
```bash
npm run dev
```
Go to http://localhost:3000

### Step 2: Activate
- Click "ACTIVATE SENSORS" button
- Status changes to "SENSORS ACTIVE: Monitoring for Customer..."

### Step 3: Trigger Motion
- Wave your hand in front of the webcam
- Wait for motion score to exceed 200
- Should auto-connect to Gemini

### Step 4: Initial Greeting
Wait for Mac to say:
> "How can I help you?"

### Step 5: Request Help
Say into microphone:
> "I want to replace this stuck water valve, but I've heard it requires a plumber due to leak issues. Can you help?"

Mac should respond asking to see the part closer.

### Step 6: Show Part
- Hold any plumbing part (or just a pipe, fitting, etc.) up to camera
- Or even just show your hand/tool if no part available

Mac should say something like:
> "Let me get a closer look at that..."

### Step 7: Part Analysis
- Screen shows "Gemini 3 Analysis" with spinning wheel
- High-res snapshot is captured
- Sent to Gemini 3
- **Wait 3-8 seconds**
- Instructions appear below the snapshot

**What you should see:**
- Your snapshot image
- Part name
- Step-by-step instructions
- Warnings section (if applicable)

### Step 8: Video Demo (Optional)
If discussing compression fittings, Mac might offer:
> "Can I show you a video on how compression fittings work?"

Say: "Yes"

Video should autoplay.

### Step 9: Inventory Check
Mac should ask:
> "Want me to tell you which aisle to find that in?"

Say: "Yes"

**What you should see:**
- Inventory search results
- Quarter Turn Water Shut-Off Valve
  - Aisle 5 - Undersink Repair
  - 3 in stock
  - $16.99
- Pipe Thread Seal Tape
  - Aisle 5
  - $1.79

### Step 10: Aisle Sign
Mac should automatically show the aisle sign image.

**What you should see:**
- "FIND IT HERE" heading
- Aisle 5 Sign.jpg (or fallback SVG with "5")

### Step 11: Closing
Mac asks:
> "Need anything else?"

Say: "No thanks"

### Step 12: Auto Reset
- Wait 60 seconds
- Kiosk should automatically return to monitoring mode
- Status: "Ready for next customer..."
- Motion detection reactivates

## Troubleshooting

### Issue: Motion detection not triggering
**Solution:**
- Make sure camera permissions are granted
- Wave more dramatically
- Check browser console for motion scores
- Lower `TRIGGER_SCORE` in App.tsx (currently 200)

### Issue: "Gemini 3 analysis failed"
**Solution:**
- Check if model name is correct
- Verify API key in `.env.local`
- Check browser console for error details
- Gemini 3 might not be released yet - wait for official API

### Issue: Aisle sign not showing
**Solution:**
- Add `public/Aisle 5 Sign.jpg`
- Or check that fallback SVG appears
- Check browser console for 404 errors

### Issue: Inventory shows "No items found"
**Solution:**
- Check that `public/inventory.json` exists
- Verify Mac is using correct search terms
- Check browser console for fetch errors

### Issue: Video not autoplaying
**Solution:**
- This is expected on first load (browser policy)
- Click anywhere on the page first
- Or wait for user gesture

### Issue: No audio from Mac
**Solution:**
- Check microphone permissions granted
- Check speaker volume
- Verify Gemini Live API connection in console
- Check for "Puck" voice in API response

## Quick Test (No Plumbing Parts Needed)

If you don't have plumbing parts:

1. Start kiosk
2. Trigger motion by waving hand
3. When Mac greets, say: "I need help with a water valve"
4. When asked to show part, just show your hand or any object
5. Gemini 3 will still analyze and provide generic instructions
6. Continue through inventory and aisle sign

The goal is to test the **workflow**, not accuracy of part identification.

## Expected Timing

- Motion detection → Connection: 1-2 seconds
- Mac's greeting: Immediate after connection
- Snapshot capture: <1 second
- Gemini 3 analysis: 3-8 seconds
- Inventory lookup: <1 second
- Aisle sign display: Immediate
- Auto-reset delay: 60 seconds

## Success Criteria

✅ Motion detection triggers connection
✅ Mac greets with Puck voice
✅ Snapshot captured and displayed
✅ Gemini 3 returns instructions
✅ Instructions displayed with warnings
✅ Inventory shows results
✅ Aisle sign displays (image or SVG)
✅ Kiosk resets after 1 minute

## Browser Console

Keep browser DevTools console open (F12) to see:
- Motion detection scores
- Gemini API responses
- Tool call triggers
- Any errors

Look for these log messages:
- `"Motion Detected! Score: XXX"`
- `"Connecting to model: gemini-2.5-flash-native-audio-preview-12-2025"`
- `"🔍 Step 1: Starting Gemini 3 deep analysis..."`
- `"✅ Gemini 3 identified X potential leak points"`
- `"🎨 Step 2: Generating annotated image..."`

## Performance Benchmarks

On a typical system:
- Snapshot resolution: 1280x720 or higher
- Snapshot file size: ~200-500KB (base64)
- Gemini 3 response time: 3-8 seconds
- Total workflow time: 10-15 seconds (greeting to final display)

## Recording Demo Video

When recording for hackathon:

1. **Prepare:**
   - Have a plumbing part ready
   - Pre-position camera for clear view
   - Test audio levels
   - Clear browser cache

2. **Start Recording** (Screen + Audio)

3. **Run Full Scenario** (Steps 1-12 above)

4. **Highlight:**
   - Motion detection activation
   - Mac's personality
   - Gemini 3 analysis (show spinner)
   - Detailed instructions with warnings
   - Inventory with pricing
   - Aisle sign image

5. **Voiceover Points:**
   - "Three Gemini models working together"
   - "Real-time conversation with Gemini 2.5 Live"
   - "Deep analysis with Gemini 3"
   - "Practical retail application"

Good luck testing! 🧪
