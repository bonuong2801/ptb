import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { CustomFrameConfig, CHANNEL_NAME } from '../types/booth';
import { SyncService } from '../utils/syncService';
import { generateFinalImage, syncDB } from '../utils/frameRenderer';
import { ScalablePreview } from './VisualFrameEditor';

export function CameraScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [channel, setChannel] = useState<SyncService | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [customConfig, setCustomConfig] = useState<CustomFrameConfig>({
    id: 'default',
    name: 'Khung Mặc Định',
    frameImage: null,
    totalShots: 4,
    frameShape: 'rectangle',
    photoShapes: ['rectangle', 'rectangle', 'rectangle', 'rectangle'], layoutMode: 'freeform', photoLayouts: [{x: 10, y: 5, width: 80, height: 20}, {x: 10, y: 28, width: 80, height: 20}, {x: 10, y: 51, width: 80, height: 20}, {x: 10, y: 74, width: 80, height: 20}]
  });
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [flash, setFlash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => localStorage.getItem('selected_camera_id') || '');
  const [isMirrored, setIsMirrored] = useState(true);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSavedCameraSessionRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);

  // App State (synced from Control)
  // Lưu TẤT CẢ state cần broadcast vào ref để tránh stale closure trong
  // các callback được đăng ký 1 lần trong useEffect([]) (bc.onMessage).
  const stateRef = useRef({ customConfig, capturedImages, isSessionActive, countdown, currentShotIndex, isProcessing });
  const channelRef = useRef<SyncService | null>(null);

  useEffect(() => {
    stateRef.current = { customConfig, capturedImages, isSessionActive, countdown, currentShotIndex, isProcessing };
  }, [customConfig, capturedImages, isSessionActive, countdown, currentShotIndex, isProcessing]);
  useEffect(() => { channelRef.current = channel; }, [channel]);

  const broadcastState = (updates: any = {}) => {
    if (channelRef.current) {
       const s = stateRef.current;
       channelRef.current.postMessage({
         type: 'SESSION_STATE',
         payload: {
           isSessionActive: s.isSessionActive,
           countdown: s.countdown,
           currentShotIndex: s.currentShotIndex,
           isProcessing: s.isProcessing,
           capturedImages: s.capturedImages,
           ...updates
         }
       });
    }
  };

  const doCountdown = (shotIndex: number) => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    let count = 5;
    setCountdown(count);
    broadcastState({ countdown: count, currentShotIndex: shotIndex, isSessionActive: true });
    
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        broadcastState({ countdown: count });
      } else {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdown(null);
        broadcastState({ countdown: null });
        takePhoto(shotIndex);
      }
    }, 1000);
  };

  const takePhoto = (shotIndex: number) => {
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    if (canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 1280; canvas.height = 720;
        
        if (video && video.srcObject && video.readyState >= 2) {
            if (isMirrored) {
              ctx.save();
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              ctx.restore();
            } else {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
        } else {
            ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(canvas.width, canvas.height);
            ctx.moveTo(canvas.width, 0); ctx.lineTo(0, canvas.height);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '24px "Courier New"'; ctx.textAlign = 'center';
            ctx.fillText(`SIMULATED SHOT ${shotIndex + 1}`, canvas.width / 2, canvas.height / 2);
        }
          
        const newImage = canvas.toDataURL('image/jpeg', 0.9);
        const currState = stateRef.current;
        const updated = [...currState.capturedImages, newImage];
          
        setCapturedImages(updated);
        broadcastState({ capturedImages: updated });
          
        if (updated.length < currState.customConfig.totalShots) {
          setTimeout(() => {
            setCurrentShotIndex(updated.length);
            doCountdown(updated.length);
          }, 1000);
        } else {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          setIsProcessing(true);
          broadcastState({ isProcessing: true });
          
          setTimeout(() => {
            setIsProcessing(false);
            setIsSessionActive(false);
            broadcastState({ isProcessing: false, isSessionActive: false });
          }, 800);
        }
      }
    }
  };

  const beginSession = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    hasSavedCameraSessionRef.current = false;
    setCapturedImages([]);
    setRecordedVideoBlob(null);
    setCurrentShotIndex(0);
    setIsSessionActive(true);
    setIsProcessing(false);
    broadcastState({ capturedImages: [], currentShotIndex: 0, isSessionActive: true, isProcessing: false });
    
    // Bắt đầu ghi video
    if (stream) {
      try {
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      } catch (e) {
        mediaRecorderRef.current = new MediaRecorder(stream);
      }
      recordedChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        setRecordedVideoBlob(blob);
      };
      mediaRecorderRef.current.start(200);
    }
    
    doCountdown(0);
  };

  const resetLocalSession = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    hasSavedCameraSessionRef.current = false;
    setCapturedImages([]);
    setRecordedVideoBlob(null);
    setCurrentShotIndex(0);
    setIsSessionActive(false);
    setCountdown(null);
    setIsProcessing(false);
    broadcastState({ capturedImages: [], currentShotIndex: 0, isSessionActive: false, countdown: null, isProcessing: false });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (!channelRef.current) return;
      if (stateRef.current.capturedImages.length === stateRef.current.customConfig.totalShots && !isProcessing) {
        return; 
      }
      const video = videoRef.current;
      const canvas = liveCanvasRef.current;
      if (canvas) {
         canvas.width = 854;
         canvas.height = 480;
         const ctx = canvas.getContext('2d');
         if (ctx) {
            if (video && video.readyState === 4) {
               if (isMirrored) {
                 ctx.save();
                 ctx.translate(canvas.width, 0);
                 ctx.scale(-1, 1);
                 ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                 ctx.restore();
               } else {
                 ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
               }
            } else {
               ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
               ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '16px "Courier New"'; ctx.textAlign = 'center';
               ctx.fillText('SIMULATION MODE', canvas.width / 2, canvas.height / 2);
            }
            const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
            channelRef.current.postMessage({ type: 'LIVE_FRAME', payload: { image: dataUrl } });
         }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isProcessing]);



  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  useEffect(() => {
    if (capturedImages.length === customConfig.totalShots && capturedImages.length > 0) {
      generateFinalImage(customConfig, capturedImages).then(async data => {
        setFinalImage(data);
      });
    } else {
      setFinalImage(null);
    }
  }, [capturedImages, customConfig]);

  useEffect(() => {
    const processAll = async () => {
      if (!finalImage || !recordedVideoBlob || capturedImages.length !== customConfig.totalShots || hasSavedCameraSessionRef.current) return;
      hasSavedCameraSessionRef.current = true;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const currentSessionName = `Session_${timestamp}`;
      
      // Truyền ArrayBuffer trực tiếp qua IPC để tránh tràn RAM và freeze Main Process
      const videoBuffer = await recordedVideoBlob.arrayBuffer();
      if (window.electronAPI) {
        await window.electronAPI.saveSession({
          sessionName: currentSessionName,
          finalImage: finalImage,
          rawImages: capturedImages,
          videoBuffer: videoBuffer
        });
      }
    };
    processAll();
  }, [finalImage, recordedVideoBlob, capturedImages, customConfig.totalShots]);

  const actionsRef = useRef({ beginSession, resetLocalSession });
  useEffect(() => {
    actionsRef.current = { beginSession, resetLocalSession };
  }, [beginSession, resetLocalSession]);

  useEffect(() => {
    const bc = new SyncService(CHANNEL_NAME);
    setChannel(bc);
    
    // Broadcast ready
    bc.postMessage({ type: 'PONG' });

    bc.onMessage(async (data) => {
      const { type, payload } = data;
      if (type === 'PING') {
        bc.postMessage({ type: 'PONG' });
      } else if (type === 'FRAME_CONFIG_UPDATE' && payload) {
        let incomingConfig = payload.customConfig;
        if (incomingConfig.frameImage === 'USE_INDEXEDDB') {
           incomingConfig.frameImage = await syncDB.get('shared_frame_image') || null;
        } else if (incomingConfig.frameImage === 'USE_LOCALSTORAGE') {
           incomingConfig.frameImage = localStorage.getItem('shared_frame_image') || null;
        }
        setCustomConfig(incomingConfig);
      } else if (type === 'SELECT_DEVICE' && payload) {
        // Use functional state update to avoid stale closure on selectedDeviceId
        setSelectedDeviceId(prev => {
           if (payload.deviceId !== prev) return payload.deviceId;
           return prev;
        });
      } else if (type === 'SET_MIRROR' && payload) {
        if (payload.isMirrored !== undefined) setIsMirrored(payload.isMirrored);
      } else if (type === 'START_SESSION') {
        actionsRef.current.beginSession();
      } else if (type === 'RESET_SESSION') {
        actionsRef.current.resetLocalSession();
      }
    });

    return () => bc.close();
  }, []);

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let isCancelled = false;
    let retryCount = 0;

    async function setupCamera() {
      try {
        const constraints = selectedDeviceId 
            ? { video: { deviceId: { exact: selectedDeviceId }, width: 1280, height: 720 } }
            : { video: { width: 1280, height: 720, facingMode: "user" } };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          mediaStream.getTracks().forEach(t => t.stop());
          return;
        }
        currentStream = mediaStream;
        setStream(mediaStream);
        setCameraError(null);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (err: any) {
        // Tự động retry sau 600ms nếu camera bị chiếm quyền truy cập (NotReadableError/TrackStartError trên Windows)
        if (!isCancelled && (err.name === 'NotReadableError' || err.name === 'TrackStartError') && retryCount < 3) {
          retryCount++;
          setTimeout(setupCamera, 600);
          return;
        }
        // Fallback: nếu exact deviceId lỗi (ví dụ camera DroidCam vừa đổi id khi reconnect), thử fallback sang default video
        if (!isCancelled && selectedDeviceId && retryCount < 4) {
          retryCount++;
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            if (isCancelled) {
              fallbackStream.getTracks().forEach(t => t.stop());
              return;
            }
            currentStream = fallbackStream;
            setStream(fallbackStream);
            setCameraError(null);
            if (videoRef.current) videoRef.current.srcObject = fallbackStream;
            return;
          } catch (_) {}
        }
        if (!isCancelled) {
          setCameraError("UI SIMULATION MODE ACTIVE (NO CAMERA)");
        }
      }
    }
    setupCamera();
    return () => { 
      isCancelled = true;
      if (currentStream) currentStream.getTracks().forEach(t => t.stop()); 
    };
  }, [selectedDeviceId]);

  return (
    <div className="flex-1 w-full h-full bg-[#080a12] relative overflow-hidden flex flex-row p-6 gap-6 items-stretch">
      {/* Left side: Live Camera Preview */}
      <div className="flex-[3] relative rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(6,182,212,0.18)] bg-black/60 flex flex-col justify-center items-center">
        {flash && (
          <div className="absolute inset-0 bg-gradient-to-r from-white via-cyan-100 to-white z-50 pointer-events-none animate-flash" />
        )}

        {capturedImages.length < customConfig.totalShots ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-transform duration-300 ${isMirrored ? '-scale-x-100' : ''}`} />
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={liveCanvasRef} className="hidden" />
            
            {countdown !== null && (
              <div key={countdown} className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-countdown-pop">
                <div className="liquid-lens-countdown">
                  <span className="text-9xl font-black text-white text-glow-cyan leading-none select-none">{countdown}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8 z-40 bg-black/80">
             {isProcessing ? (
                <div className="flex flex-col items-center justify-center gap-6">
                  <RefreshCw className="w-16 h-16 animate-spin text-cyan-400" />
                  <p className="font-mono text-xl tracking-widest text-cyan-400 uppercase font-bold text-glow-cyan">Processing Strip...</p>
                </div>
             ) : (
                <div className="absolute inset-0 z-40 bg-black/80 flex flex-col items-center justify-center backdrop-blur-xl overflow-y-auto p-6 custom-scrollbar animate-zoom-in">
                   <div className="liquid-glass p-8 md:p-12 rounded-3xl flex flex-col items-center justify-center gap-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)] my-auto w-full max-w-4xl border border-white/20">
                      <div className="flex flex-col items-center text-center">
                        <div className="liquid-glass-pill px-4 py-1 text-xs font-mono text-cyan-300 uppercase tracking-widest mb-3 border border-cyan-400/30">
                          Capture Complete
                        </div>
                        <h3 className="text-4xl font-black tracking-tight mb-2 uppercase bg-gradient-to-r from-white via-cyan-100 to-indigo-200 bg-clip-text text-transparent">Cảm ơn bạn!</h3>
                        <p className="text-white/60 font-medium text-lg">Vui lòng nhận ảnh in tại quầy chụp ảnh</p>
                      </div>

                      {finalImage && (
                        <div className="flex justify-center w-full h-[62vh] relative">
                          <img src={finalImage} className="h-full object-contain drop-shadow-[0_15px_35px_rgba(0,0,0,0.6)] rounded-2xl border border-white/20" alt="Final Strip" />
                        </div>
                      )}
                   </div>
                </div>
             )}
          </div>
        )}

        {!stream && capturedImages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-8 text-center z-10">
            {cameraError ? (
              <p className="text-cyan-300 uppercase tracking-widest text-lg font-mono border border-cyan-400/30 p-6 rounded-2xl liquid-glass">
                {cameraError}
              </p>
            ) : (
              <p className="text-cyan-400/60 uppercase tracking-widest text-lg font-mono animate-pulse">Initializing Optical Hardware...</p>
            )}
          </div>
        )}
      </div>

      {/* Right side: Final Frame/Strip Layout Preview */}
      <div className="w-[380px] h-full flex flex-col py-6 liquid-glass rounded-3xl shadow-2xl relative shrink-0 items-center">
         <div className="flex-1 w-full p-3 flex flex-col items-center overflow-hidden bg-black/30 rounded-2xl relative">
           <ScalablePreview config={customConfig} capturedImages={capturedImages} />
         </div>
      </div>
    </div>
  );
}

export default CameraScreen;
