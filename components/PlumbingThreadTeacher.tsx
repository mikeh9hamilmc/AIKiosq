import React, { useRef, useEffect } from 'react';
import { LessonStage, PlumbingThreadTeacherProps } from '../types';

const PlumbingThreadTeacher: React.FC<PlumbingThreadTeacherProps> = ({
  lessonStage,
  isConnected,
  videoUrl,
  partAnalysis,
  inventoryItems,
  aisleSignPath,
  countdownValue
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Force autoplay when video URL changes - critical for kiosk without user interaction
  useEffect(() => {
    if (lessonStage === LessonStage.PLAYING_VIDEO && videoUrl && videoRef.current) {
      const video = videoRef.current;

      // Start muted to satisfy browser autoplay policy, then unmute
      video.muted = true;
      video.play()
        .then(() => {
          // Successfully started - unmute for audio
          video.muted = false;
        })
        .catch((err) => {
          console.error('Video autoplay failed:', err);
          // Keep trying muted if unmute fails
          video.muted = true;
          video.play().catch(e => console.error('Muted autoplay also failed:', e));
        });
    }
  }, [lessonStage, videoUrl]);
  const isCompare = lessonStage === LessonStage.COMPARE_THREADS;
  const isHighlight = lessonStage === LessonStage.HIGHLIGHT_FERRULE;
  const isIdle = lessonStage === LessonStage.IDLE;
  const isPlaying = lessonStage === LessonStage.PLAYING_VIDEO;
  const isAnalyzing = lessonStage === LessonStage.ANALYZING_PART;
  const isShowingAnalysis = lessonStage === LessonStage.SHOWING_ANALYSIS;
  const isShowingInventory = lessonStage === LessonStage.SHOWING_INVENTORY;
  const isShowingAisle = lessonStage === LessonStage.SHOWING_AISLE;

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden workshop-paper border-8 border-[#2F4F4F] shadow-2xl rounded-lg">


      {isIdle && !isConnected && (
        <div className="text-center p-8 border-4 border-dashed border-[#003366]/30 rounded-xl">
          <h2 className="text-3xl text-[#003366] font-bold mb-4 animate-pulse">WAITING FOR NEW CUSTOMER</h2>
        </div>
      )}

      {isIdle && isConnected && (
        <div className="text-center p-8 border-4 border-dashed border-[#003366]/30 rounded-xl">
          <h2 className="text-3xl text-[#003366] font-bold mb-4">Welcome, How can we help you?</h2>
        </div>
      )}

      {isPlaying && videoUrl && (
        <div className="w-full h-full bg-black relative flex items-center justify-center">
          {videoUrl.includes('drive.google.com') ? (
            <iframe
              src={videoUrl}
              className="w-full h-full border-none"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Instructional Video"
            />
          ) : (
            <video
              ref={videoRef}
              key={videoUrl}
              src={videoUrl}
              autoPlay
              muted
              playsInline
              className="max-w-full max-h-full border-4 border-[#1a1a1a] shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            />
          )}

          <div className="absolute top-0 left-0 bg-[#003366] text-white text-xs px-2 py-1 font-mono z-20 pointer-events-none">
            SOURCE: {videoUrl.includes('drive.google.com') ? 'CLOUD_ARCHIVE' : 'LOCAL_STORAGE'}
          </div>
        </div>
      )}

      {(isCompare || isHighlight) && (
        <svg viewBox="0 0 800 500" className="w-full h-full p-8 transition-all duration-700">
          <defs>
            <pattern id="diagonalHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="10" className="blueprint-ink" strokeWidth="1" />
            </pattern>
          </defs>

          {/* LEFT DIAGRAM: IPS (Tapered) */}
          <g
            className={`transition-all duration-700 transform ${isHighlight ? 'opacity-20 -translate-x-20' : 'opacity-100'}`}
          >
            <text x="200" y="50" textAnchor="middle" className="blueprint-ink text-xl font-bold tracking-widest">IPS (NPT)</text>
            <text x="200" y="450" textAnchor="middle" className="fill-red-800 text-lg font-bold">NEEDS TAPE</text>

            <path d="M100,100 L300,100 L290,400 L110,400 Z" fill="none" stroke="#003366" strokeWidth="3" />
            <path d="M100,120 L300,120" stroke="#003366" strokeWidth="1" />
            <path d="M102,140 L298,140" stroke="#003366" strokeWidth="1" />
            <path d="M104,160 L296,160" stroke="#003366" strokeWidth="1" />
            <path d="M106,180 L294,180" stroke="#003366" strokeWidth="1" />
            <path d="M108,200 L292,200" stroke="#003366" strokeWidth="1" />
            <line x1="80" y1="100" x2="110" y2="400" stroke="#003366" strokeWidth="1" strokeDasharray="5,5" opacity="0.5" />
            <line x1="320" y1="100" x2="290" y2="400" stroke="#003366" strokeWidth="1" strokeDasharray="5,5" opacity="0.5" />
          </g>

          {/* RIGHT DIAGRAM: COMPRESSION */}
          <g
            className={`transition-all duration-700 transform ${isHighlight ? 'translate-x-[-200px] scale-125' : ''}`}
            style={{ transformOrigin: '600px 250px' }}
          >
            <text x="600" y="50" textAnchor="middle" className="blueprint-ink text-xl font-bold tracking-widest">COMPRESSION</text>
            <text x="600" y="450" textAnchor="middle" className="blueprint-ink text-lg font-bold">
              {isHighlight ? '' : 'NO TAPE'}
            </text>

            <path d="M500,100 L700,100 L700,400 L500,400 Z" fill="none" stroke="#003366" strokeWidth="3" />
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={i} x1="500" y1={120 + i * 25} x2="700" y2={120 + i * 25} stroke="#003366" strokeWidth="2" />
            ))}

            <path
              d="M480,320 L720,320 L720,360 L480,360 Z"
              className={`transition-colors duration-500 ease-in-out ${isHighlight ? 'fill-[#FF4500]' : 'fill-transparent'}`}
              stroke="#003366"
              strokeWidth="2"
              data-testid="ferrule"
            />

            <path d="M470,280 L730,280 L730,310 L470,310 Z" fill="none" stroke="#003366" strokeWidth="1" strokeDasharray="4,4" />

            {isHighlight && (
              <g className="animate-fade-in">
                <line x1="720" y1="340" x2="780" y2="340" stroke="#FF4500" strokeWidth="3" />
                <circle cx="780" cy="340" r="4" fill="#FF4500" />
                <text
                  x="600"
                  y="450"
                  textAnchor="middle"
                  className="fill-[#FF4500] text-2xl font-black"
                  data-testid="seal-point-label"
                >
                  SEAL POINT
                </text>
              </g>
            )}
          </g>
        </svg>
      )}

      {/* COUNTDOWN TO SNAPSHOT */}
      {lessonStage === LessonStage.COUNTDOWN_TO_SNAPSHOT && (
        <div className="text-center p-8 flex flex-col items-center justify-center h-full">
          <h2 className="text-4xl text-[#003366] font-bold mb-8 animate-pulse">
            HOLD UP YOUR PART
          </h2>
          <div className="text-[12rem] font-black text-[#003366] leading-none mb-4">
            {countdownValue}
          </div>
          <p className="text-2xl text-[#003366] font-bold">
            Capturing in {countdownValue}...
          </p>
        </div>
      )}

      {/* ANALYZING PART - Loading Spinner */}
      {isAnalyzing && (
        <div className="text-center p-8">
          <div className="inline-block animate-spin rounded-full h-24 w-24 border-8 border-[#003366] border-t-transparent mb-6"></div>
          <h2 className="text-3xl text-[#003366] font-bold mb-2">GEMINI 3 ANALYSIS</h2>
          <p className="text-[#003366] text-xl">Mac is examining your part...</p>
        </div>
      )}

      {/* SHOWING ANALYSIS - Snapshot + Part Name (Mac explains verbally) */}
      {isShowingAnalysis && partAnalysis && (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#F5F5DC]">
          <h2 className="text-3xl text-[#003366] font-bold mb-6 border-b-4 border-[#003366] pb-2">
            PART IDENTIFIED
          </h2>

          <div className="border-4 border-[#003366] rounded-lg overflow-hidden shadow-lg max-w-2xl">
            <img
              src={`data:image/jpeg;base64,${partAnalysis.snapshotBase64}`}
              alt="Part snapshot"
              className="w-full h-auto"
            />
            <div className="bg-[#003366] text-white px-4 py-3 text-xl font-bold text-center">
              {partAnalysis.partName}
            </div>
          </div>
        </div>
      )}

      {/* SHOWING INVENTORY - Product List */}
      {isShowingInventory && inventoryItems && (
        <div className="w-full h-full overflow-y-auto p-6 bg-[#F5F5DC]">
          <h2 className="text-3xl text-[#003366] font-bold mb-4 border-b-4 border-[#003366] pb-2">
            🏪 INVENTORY RESULTS
          </h2>

          {inventoryItems.length === 0 ? (
            <p className="text-xl text-[#003366] text-center mt-12">No items found. Please ask Mac for help!</p>
          ) : (
            <div className="space-y-4">
              {inventoryItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border-4 border-[#003366] rounded-lg p-4 shadow-lg"
                >
                  <h3 className="text-2xl text-[#003366] font-bold mb-2">{item.name}</h3>
                  <p className="text-[#003366] mb-3">{item.description}</p>

                  <div className="flex justify-between items-center border-t-2 border-[#003366]/30 pt-3">
                    <div>
                      <span className="text-3xl text-green-700 font-bold">${item.price.toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg text-[#003366] font-bold">{item.aisle}</div>
                      <div className={`text-sm font-bold ${item.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.stock > 0 ? `${item.stock} in stock` : 'Out of stock'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SHOWING AISLE - Aisle Sign */}
      {isShowingAisle && aisleSignPath && (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#F5F5DC]">
          <h2 className="text-4xl text-[#003366] font-bold mb-6">📍 FIND IT HERE</h2>

          <div className="border-8 border-[#003366] rounded-lg overflow-hidden shadow-2xl max-w-3xl">
            <img
              src={aisleSignPath}
              alt="Aisle sign"
              className="w-full h-auto"
              onError={(e) => {
                // Fallback if image not found
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,' + btoa(`
                  <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
                    <rect width="400" height="300" fill="#003366"/>
                    <text x="50%" y="50%" fill="white" font-size="48" font-weight="bold" text-anchor="middle" dominant-baseline="middle">
                      ${aisleSignPath.replace(/[^0-9]/g, '')}
                    </text>
                  </svg>
                `);
              }}
            />
          </div>

          <p className="text-2xl text-[#003366] mt-6 font-bold">Look for this sign in the store!</p>
        </div>
      )}
    </div>
  );
};

export default PlumbingThreadTeacher;