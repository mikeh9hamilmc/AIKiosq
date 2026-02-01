import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import PlumbingThreadTeacher from './components/PlumbingThreadTeacher';
import { GeminiLiveService } from './services/geminiService';
import { Gemini3AnalysisService } from './services/gemini3AnalysisService';
import { InventoryService } from './services/inventoryService';
import { LessonStage, PartAnalysis, InventoryItem } from './types';
import { blobToBase64 } from './services/imageUtils';

// Google Drive Embed URL (Using /preview for reliable iframe playback)
const COMPRESSION_VIDEO_PATH = '/compression_demo.mp4';

const DEBUG_STEPS: Record<string, string> = {
  'offline': 'Step 1: Boot',
  'sensors': 'Step 2: Sensors Active',
  'connecting': 'Step 3: Connecting to Gemini',
  'greeting': 'Step 4: Greeting',
  'conversation': 'Step 5: Conversation',
  'analyzing': 'Step 6: Analyze Part',
  'video': 'Step 7: Video Demo',
  'inventory': 'Step 8: Inventory Check',
  'aisle': 'Step 9: Aisle Sign',
  'closing': 'Step 10: Closing',
  'resetting': 'Step 11: Reset',
};

const App: React.FC = () => {
  const [stage, setStage] = useState<LessonStage>(LessonStage.IDLE);
  const [status, setStatus] = useState<string>('System Offline');
  const [isConnected, setIsConnected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [partAnalysis, setPartAnalysis] = useState<PartAnalysis | undefined>(undefined);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [aisleSignPath, setAisleSignPath] = useState<string | undefined>(undefined);
  const [logs, setLogs] = useState<{ text: string; color: string }[]>([
    { text: 'Boot Sequence Complete.', color: 'text-gray-300' }
  ]);
  const [currentStep, setCurrentStep] = useState('offline');
  const [countdownValue, setCountdownValue] = useState<number>(3);

  const addLog = useCallback((text: string, color = 'text-gray-300') => {
    setLogs((prev: { text: string; color: string }[]) => [...prev, { text, color }]);
  }, []);

  const [liveService] = useState(() => new GeminiLiveService());
  const [analysisService] = useState(() => new Gemini3AnalysisService(process.env.API_KEY!));
  const [inventoryService] = useState(() => new InventoryService());

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previousFrameRef = useRef<ImageData | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);

  // Motion Detection Configuration
  const MOTION_THRESHOLD = 50;
  const TRIGGER_SCORE = 200;

  // Load inventory on mount
  useEffect(() => {
    inventoryService.loadInventory();
  }, [inventoryService]);

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480 }
      });
      streamRef.current = stream;

      // EXPOSE FOR TESTING
      // @ts-ignore
      window.triggerGeminiConnection = () => {
        console.log("TEST MODE: Triggering connection... StreamRef:", streamRef.current);
        connectToGemini();
      };

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setIsMonitoring(true);
      setCurrentStep('sensors');
      setStatus('SENSORS ACTIVE: Monitoring for Customer...');
      addLog('Camera + Mic acquired.', 'text-green-400');
      addLog('Motion Sensors Active.', 'text-green-400');
    } catch (err) {
      console.error("Failed to access camera", err);
      setStatus('ERROR: Camera Access Denied');
      addLog('ERROR: Camera access denied.', 'text-red-400');
    }
  };

  const stopSystem = useCallback(async () => {
    addLog('SHUTDOWN initiated.', 'text-red-400');
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    await liveService.disconnect();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsConnected(false);
    setIsMonitoring(false);
    setCurrentStep('offline');
    setStatus('System Offline');
    setStage(LessonStage.IDLE);
    setVideoUrl(undefined);
    setPartAnalysis(undefined);
    setInventoryItems([]);
    setAisleSignPath(undefined);
  }, [liveService]);

  // Schedule reset after conversation ends - waits 1 minute then
  // re-enables motion detection for the next customer
  const scheduleReset = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    setCurrentStep('resetting');
    addLog('Session ended. 60s reset timer started.', 'text-yellow-400');
    setStatus('Session ended. Resetting in 1 minute...');
    setPartAnalysis(undefined);
    setInventoryItems([]);
    setAisleSignPath(undefined);
    setVideoUrl(undefined);
    resetTimeoutRef.current = window.setTimeout(async () => {
      await liveService.disconnect();
      setIsConnected(false);
      setStage(LessonStage.IDLE);
      setCurrentStep('sensors');
      setStatus('SENSORS ACTIVE: Monitoring for Customer...');
      setIsMonitoring(true);
    }, 60000); // 1 minutes
  }, [liveService]);

  // Handle part analysis callback — returns result text for the tool response
  const handleAnalyzePart = useCallback(async (_: string, userQuestion: string): Promise<string> => {
    if (!videoRef.current) {
      console.error("handleAnalyzePart ABORTED: No videoRef");
      return 'Analysis aborted: camera not available.';
    }

    try {
      addLog('Tool call: analyze_part received.', 'text-cyan-300');

      // Start Countdown
      setCurrentStep('analyzing');
      setStage(LessonStage.COUNTDOWN_TO_SNAPSHOT);

      for (let i = 3; i > 0; i--) {
        setCountdownValue(i);
        setStatus(`📸 Hold up your part! Capturing in ${i}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setStage(LessonStage.ANALYZING_PART);
      setStatus('📸 Capturing snapshot...');

      // Capture snapshot directly from the already-rendering camera video element
      addLog('Capturing high-res snapshot...', 'text-yellow-400');
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
          'image/jpeg',
          0.95
        );
      });
      const snapshotBase64 = await blobToBase64(blob);
      addLog(`Snapshot captured (${canvas.width}x${canvas.height}).`, 'text-green-400');

      setStatus('🧠 Mac is analyzing with Gemini 3...');
      addLog('Sending to Gemini 3 for analysis...', 'text-yellow-400');

      // Analyze with Gemini 3
      const result = await analysisService.analyzePartForReplacement(snapshotBase64, userQuestion);

      addLog(`Part identified: ${result.partName}`, 'text-green-400');
      addLog(`${result.warnings.length} warning(s) found.`, result.warnings.length > 0 ? 'text-red-400' : 'text-green-400');

      setPartAnalysis({
        ...result,
        snapshotBase64
      });

      setStage(LessonStage.SHOWING_ANALYSIS);
      setStatus('✅ Analysis complete!');
      addLog('Analysis displayed on screen.', 'text-green-400');

      // Return results for the tool response — Mac will explain them
      return `Analysis Complete.\nPart Identified: ${result.partName}\nInstructions: ${result.instructions}\nWarnings: ${result.warnings.join(', ')}\n\nPlease explain these results to the customer simply and concisely.`;

    } catch (error) {
      console.error('Part analysis failed:', error);
      setStatus('❌ Analysis failed - please try again');
      addLog(`Analysis FAILED: ${error}`, 'text-red-400');
      setStage(LessonStage.IDLE);
      return 'Analysis failed. Please ask the customer to try again.';
    }
  }, [analysisService]);

  // EXPOSE HANDLERS FOR TESTING
  useEffect(() => {
    // @ts-ignore
    window.kioskHooks = {
      // @ts-ignore
      ...window.kioskHooks,
      handleAnalyzePart: (q: string) => handleAnalyzePart('', q),
      analysisService: analysisService
    };
  }, [handleAnalyzePart, analysisService]);

  // Handle inventory check callback
  const handleCheckInventory = useCallback(async (query: string) => {
    try {
      addLog(`Tool call: check_inventory("${query}")`, 'text-cyan-300');
      setCurrentStep('inventory');
      setStatus('🔍 Checking inventory...');

      const items = inventoryService.searchItems(query);

      addLog(`Found ${items.length} item(s) matching "${query}".`, 'text-green-400');
      items.forEach(item => {
        addLog(`  ${item.name} - ${item.aisle} - $${item.price.toFixed(2)} (${item.stock} in stock)`, 'text-gray-300');
      });

      setInventoryItems(items);
      setStage(LessonStage.SHOWING_INVENTORY);
      setStatus(`Found ${items.length} item(s) in stock`);
    } catch (error) {
      console.error('Inventory check failed:', error);
      setStatus('❌ Inventory lookup failed');
      addLog(`Inventory FAILED: ${error}`, 'text-red-400');
    }
  }, [inventoryService, addLog]);

  // Handle aisle sign display callback
  const handleShowAisleSign = useCallback((aisleName: string) => {
    addLog(`Tool call: show_aisle_sign("${aisleName}")`, 'text-cyan-300');
    setCurrentStep('aisle');
    // Convert aisle name to file path
    // "Aisle 5 - Undersink Repair" -> "/Aisle 5 Sign.jpg"
    const aisleNumber = 5; //aisleName.match(/Aisle (\d+)/)?.[1] || '5'; only have one aisle sign for demo
    const signPath = `/Aisle ${aisleNumber} Sign.jpg`;

    addLog(`Loading sign: ${signPath}`, 'text-gray-300');
    setAisleSignPath(signPath);
    setStage(LessonStage.SHOWING_AISLE);
    setStatus(`Showing ${aisleName}`);
  }, [addLog]);

  const connectToGemini = useCallback(async () => {
    console.log("connectToGemini called. Stream:", streamRef.current);
    if (!streamRef.current) {
      console.error("connectToGemini ABORTED: No streamRef.current");
      return;
    }
    setIsConnected(true);
    setIsMonitoring(false);
    setCurrentStep('connecting');
    addLog('Customer Detected!', 'text-yellow-400');
    addLog('Connecting to Gemini Live...', 'text-yellow-400');

    await liveService.start({
      onStageChange: (newStage) => {
        setStage(newStage);
        addLog(`Stage -> ${newStage}`, 'text-gray-400');
      },
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus.includes('Connected')) setCurrentStep('greeting');
      },
      onAnalyzePart: handleAnalyzePart,
      onCheckInventory: handleCheckInventory,
      onShowAisleSign: handleShowAisleSign,
      onSessionEnd: scheduleReset
    }, streamRef.current);
  }, [liveService, handleAnalyzePart, handleCheckInventory, handleShowAisleSign, scheduleReset]);

  // Motion Detection Loop
  useEffect(() => {
    if (!isMonitoring || isConnected) return;

    let animationFrameId: number;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    canvas.width = 64;
    canvas.height = 48;

    const checkForMotion = () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || !ctx) {
        animationFrameId = requestAnimationFrame(checkForMotion);
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (previousFrameRef.current) {
        let diffScore = 0;
        const data = currentFrame.data;
        const prevData = previousFrameRef.current.data;

        for (let i = 0; i < data.length; i += 4) {
          if (Math.abs(data[i] - prevData[i]) + Math.abs(data[i + 1] - prevData[i + 1]) + Math.abs(data[i + 2] - prevData[i + 2]) > MOTION_THRESHOLD) {
            diffScore++;
          }
        }

        if (diffScore > TRIGGER_SCORE) {
          console.log("Motion Detected! Score:", diffScore, "Triggering connection...");
          connectToGemini();
          return;
        }
      }

      previousFrameRef.current = currentFrame;
      animationFrameId = requestAnimationFrame(checkForMotion);
    };

    animationFrameId = requestAnimationFrame(checkForMotion);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isMonitoring, isConnected, connectToGemini]);


  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* Header / Status Bar */}
      <div className="w-full max-w-5xl mb-6 flex items-center justify-between bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
        <div>
          <h1 className="text-white font-mono text-xl">AIKiosQ <span className="text-yellow-400 text-sm">// {DEBUG_STEPS[currentStep]}</span></h1>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-500 animate-pulse' : isConnected ? 'bg-red-500' : 'bg-gray-500'}`}></div>
            <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest">{status}</p>
          </div>
        </div>

        {!isMonitoring && !isConnected ? (
          <button
            onClick={startMonitoring}
            className="bg-blue-700 hover:bg-blue-600 text-white font-mono px-6 py-2 rounded shadow border border-blue-500 transition-colors animate-bounce"
          >
            ACTIVATE SENSORS
          </button>
        ) : (
          <button
            onClick={stopSystem}
            className="bg-red-900 hover:bg-red-800 text-white font-mono px-6 py-2 rounded shadow border border-red-700 transition-colors"
          >
            SHUTDOWN
          </button>
        )}
      </div>

      {/* Main Visual Display */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-4 h-[600px]">

        <div className="md:col-span-2 relative bg-black rounded-lg border-4 border-gray-800 overflow-hidden">
          <PlumbingThreadTeacher
            lessonStage={stage}
            isConnected={isConnected}
            videoUrl={videoUrl}
            partAnalysis={partAnalysis}
            inventoryItems={inventoryItems}
            aisleSignPath={aisleSignPath}
            countdownValue={countdownValue}
          />

        </div>

        {/* Status / Instructions Panel */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex flex-col font-mono text-sm text-gray-300">
          <h3 className="text-white border-b border-gray-600 pb-2 mb-4">SYSTEM LOG</h3>
          <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
            {logs.slice(-10).map((log, i) => (
              <p key={i} className={log.color}>&gt; {log.text}</p>
            ))}
          </div>

          {/* Camera Feed */}
          <div className="mt-4 relative bg-black border-2 border-red-900/50 shadow-lg rounded overflow-hidden">
            <video
              ref={videoRef}
              className={`w-full h-auto object-cover opacity-80 ${isMonitoring ? 'grayscale contrast-125' : ''}`}
              muted
              playsInline
            />
            <div className="absolute top-1 left-1 bg-black/50 text-[10px] text-red-500 font-mono px-1">
              CAM_01: {isMonitoring ? 'SCANNING' : isConnected ? 'LIVE_FEED' : 'OFFLINE'}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;