import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Camera } from 'lucide-react';
import { CustomFrameConfig, CHANNEL_NAME, CaptureSourceMode, TetherPhotoData } from '../types/booth';
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

  const [paymentQrInfo, setPaymentQrInfo] = useState<{
    show: boolean;
    qrUrl?: string;
    amount?: number;
    transferCode?: string;
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  } | null>(null);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [captureSourceMode, setCaptureSourceMode] = useState<CaptureSourceMode>(() => (localStorage.getItem('capture_source_mode') as CaptureSourceMode) || 'stream');
  const [isWaitingForTetherPhoto, setIsWaitingForTetherPhoto] = useState(false);
  const isWaitingTetherRef = useRef(false);
  const tetherFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const commitShotImage = (imageUrl: string) => {
    const currState = stateRef.current;
    const updated = [...currState.capturedImages, imageUrl];
      
    setCapturedImages(updated);
    setCurrentShotIndex(updated.length);
      
    if (updated.length >= currState.customConfig.totalShots) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsProcessing(true);
      broadcastState({ capturedImages: updated, currentShotIndex: updated.length, isProcessing: true });
      
      setTimeout(() => {
        setIsProcessing(false);
        setIsSessionActive(false);
        broadcastState({ capturedImages: updated, currentShotIndex: updated.length, isProcessing: false, isSessionActive: false });
      }, 800);
    } else {
      // CHẾ ĐỘ BẤM CHỦ ĐỘNG: Dừng lại và chờ người dùng bấm shot tiếp theo!
      setIsSessionActive(true);
      broadcastState({ capturedImages: updated, currentShotIndex: updated.length, isSessionActive: true, isProcessing: false, countdown: null });
    }
  };

  const captureFromVideoCanvas = (shotIndex: number) => {
    if (canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = (video?.videoWidth) || 1280;
        canvas.height = (video?.videoHeight) || 720;
        
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
        commitShotImage(newImage);
      }
    }
  };

  const takePhoto = (shotIndex: number) => {
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    if (captureSourceMode === 'hotfolder') {
      isWaitingTetherRef.current = true;
      setIsWaitingForTetherPhoto(true);

      // Fallback 6.5s: Nếu máy ảnh không gửi file sau 6.5s thì chụp từ video canvas để không bị đơ session
      if (tetherFallbackTimerRef.current) clearTimeout(tetherFallbackTimerRef.current);
      tetherFallbackTimerRef.current = setTimeout(() => {
        if (isWaitingTetherRef.current) {
          console.warn('[CameraScreen] Tether timeout (6.5s) - Fallback to video canvas');
          isWaitingTetherRef.current = false;
          setIsWaitingForTetherPhoto(false);
          captureFromVideoCanvas(shotIndex);
        }
      }, 6500);
    } else {
      captureFromVideoCanvas(shotIndex);
    }
  };

  const triggerShot = (delay: number = 0) => {
    const currState = stateRef.current;
    if (currState.capturedImages.length >= currState.customConfig.totalShots) return;
    if (currState.isProcessing) return;

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // Bắt đầu ghi video BTS ở shot đầu tiên nếu chưa ghi
    if (currState.capturedImages.length === 0 && stream && (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive')) {
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

    const nextIndex = currState.capturedImages.length;
    setCurrentShotIndex(nextIndex);
    setIsSessionActive(true);

    if (delay <= 0) {
      setCountdown(null);
      broadcastState({ countdown: null, currentShotIndex: nextIndex, isSessionActive: true });
      takePhoto(nextIndex);
    } else {
      let count = delay;
      setCountdown(count);
      broadcastState({ countdown: count, currentShotIndex: nextIndex, isSessionActive: true });
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
          takePhoto(nextIndex);
        }
      }, 1000);
    }
  };

  const retakeLastShot = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    const curr = stateRef.current.capturedImages;
    if (curr.length > 0) {
      const updated = curr.slice(0, -1);
      setCapturedImages(updated);
      setCurrentShotIndex(updated.length);
      setIsProcessing(false);
      broadcastState({ capturedImages: updated, currentShotIndex: updated.length, isSessionActive: true, isProcessing: false, countdown: null });
    }
  };

  const beginSession = () => {
    triggerShot(0);
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
    setPaymentQrInfo(null);
    setShowPaymentSuccess(false);
    if (tetherFallbackTimerRef.current) {
      clearTimeout(tetherFallbackTimerRef.current);
      tetherFallbackTimerRef.current = null;
    }
    isWaitingTetherRef.current = false;
    setIsWaitingForTetherPhoto(false);
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
         const vw = (video && video.videoWidth > 0) ? video.videoWidth : 854;
         const vh = (video && video.videoHeight > 0) ? video.videoHeight : 480;
         canvas.width = vw;
         canvas.height = vh;
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

  
  // Tether Hot Folder Photo Ingestion Listener
  useEffect(() => {
    if (window.electronAPI?.onTetherPhoto) {
      const unsub = window.electronAPI.onTetherPhoto((photo) => {
        if (isWaitingTetherRef.current) {
          if (tetherFallbackTimerRef.current) {
            clearTimeout(tetherFallbackTimerRef.current);
            tetherFallbackTimerRef.current = null;
          }
          isWaitingTetherRef.current = false;
          setIsWaitingForTetherPhoto(false);
          console.log('[CameraScreen] Đã nhận ảnh 24MP từ máy ảnh:', photo.filename);
          commitShotImage(photo.dataUrl);
        }
      });
      return () => {
        if (unsub) unsub();
      };
    }
  }, []);

  const actionsRef = useRef({ beginSession, resetLocalSession, triggerShot, retakeLastShot });
  useEffect(() => {
    actionsRef.current = { beginSession, resetLocalSession, triggerShot, retakeLastShot };
  }, [beginSession, resetLocalSession, triggerShot, retakeLastShot]);

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
      } else if (type === 'TRIGGER_SHOT') {
        const delay = (payload && typeof payload.delay === 'number') ? payload.delay : 0;
        actionsRef.current.triggerShot(delay);
      } else if (type === 'RETAKE_LAST_SHOT') {
        actionsRef.current.retakeLastShot();
      } else if (type === 'START_SESSION') {
        const delay = (payload && typeof payload.delay === 'number') ? payload.delay : 0;
        actionsRef.current.triggerShot(delay);
      } else if (type === 'RESET_SESSION') {
        actionsRef.current.resetLocalSession();
      } else if (type === 'CAPTURE_MODE_SYNC' && payload) {
        if (payload.mode) {
          setCaptureSourceMode(payload.mode);
          localStorage.setItem('capture_source_mode', payload.mode);
        }
      } else if (type === 'PAYMENT_QR_SYNC' && payload) {
        setPaymentQrInfo(payload);
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
            {/* Progress indicator on Customer Screen */}
            <div className="absolute top-6 left-6 z-30 flex items-center gap-3 liquid-glass px-5 py-2.5 rounded-full border border-white/20 shadow-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-white font-mono font-bold text-sm tracking-wider uppercase">
                ẢNH {capturedImages.length + 1} / {customConfig.totalShots}
              </span>
              <div className="flex gap-1.5 ml-1">
                {Array.from({ length: customConfig.totalShots }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      i < capturedImages.length 
                        ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]' 
                        : 'bg-white/20'
                    }`} 
                  />
                ))}
              </div>
            </div>

            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-contain bg-black transition-transform duration-300 ${isMirrored ? '-scale-x-100' : ''}`} />
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={liveCanvasRef} className="hidden" />
            
            
            {/* Tether Hot Folder Receiving Photo Overlay */}
            {isWaitingForTetherPhoto && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-40 animate-zoom-in backdrop-blur-sm">
                <div className="bg-[#0c101d] border-2 border-cyan-400/60 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-[0_0_50px_rgba(6,182,212,0.4)] max-w-sm text-center">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                      <Camera className="w-8 h-8 text-cyan-300 animate-pulse" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-cyan-400 rounded-full animate-ping" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-cyan-300 font-mono tracking-wider">ĐANG NHẬN ẢNH TỪ MÁY ẢNH</h3>
                    <p className="text-xs text-white/60 font-mono mt-1">Độ phân giải 24MP • Cảm biến quang học</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-amber-300/90 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-400/20 font-mono font-bold">
                    <span className="animate-spin">⏳</span> Đang truyền file qua cáp USB...
                  </div>
                </div>
              </div>
            )}

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
                        <div className="flex flex-col md:flex-row items-center justify-center gap-8 w-full max-h-[62vh] relative">
                          <div className="h-[58vh] flex items-center justify-center shrink-0">
                            <img src={finalImage} className="h-full object-contain drop-shadow-[0_15px_35px_rgba(0,0,0,0.6)] rounded-2xl border border-white/20" alt="Final Strip" />
                          </div>
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

      {/* Standalone Fullscreen High-contrast Payment VietQR Overlay for Customer Screen */}
      {paymentQrInfo?.show && paymentQrInfo?.qrUrl && (
        <div className="fixed inset-0 z-[100] bg-[#06080f]/95 flex items-center justify-center p-6 animate-zoom-in backdrop-blur-md">
          <div className="bg-[#0c101d] border-2 border-cyan-400/50 rounded-3xl p-8 sm:p-10 max-w-lg w-full flex flex-col items-center gap-6 shadow-[0_0_60px_rgba(6,182,212,0.35)] relative overflow-hidden">
            {/* Ambient radar glows */}
            <div className="absolute -top-24 -left-24 w-52 h-52 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Title Badge */}
            <div className="flex items-center gap-2.5 px-5 py-2 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 font-mono text-xs uppercase tracking-widest font-bold shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              📱 QUÉT MÃ THANH TOÁN CHUYỂN KHOẢN
            </div>

            {/* High-Contrast QR Code Card with Scanner Laser Line */}
            <div className="relative p-4 bg-white rounded-3xl shadow-2xl border-4 border-cyan-400/60 overflow-hidden">
              <img src={paymentQrInfo.qrUrl} alt="VietQR" className="w-64 h-64 sm:w-72 sm:h-72 object-contain block select-none" />
              <div className="absolute inset-x-4 top-4 h-1.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan-line pointer-events-none shadow-[0_0_10px_#22d3ee]" />
            </div>

            {/* Price & Bank Details */}
            <div className="text-center font-mono w-full flex flex-col items-center gap-1">
              <div className="text-4xl sm:text-5xl font-black text-cyan-300 text-glow-cyan">
                {paymentQrInfo.amount?.toLocaleString('vi-VN')} <span className="text-xl sm:text-2xl font-bold">VNĐ</span>
              </div>
              <div className="text-base sm:text-lg text-white font-bold mt-1 tracking-wide">
                {paymentQrInfo.bankName}
              </div>
              <div className="text-sm text-cyan-100/80">
                STK: <strong className="text-white text-base select-all font-mono font-bold tracking-wider">{paymentQrInfo.accountNumber}</strong> ({paymentQrInfo.accountHolder})
              </div>
              {paymentQrInfo.transferCode && (
                <div className="mt-2.5 inline-block bg-amber-500/15 border border-amber-400/50 text-amber-300 px-5 py-2 rounded-xl text-sm font-bold font-mono shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                  Nội dung CK: <strong className="text-white select-all">{paymentQrInfo.transferCode}</strong>
                </div>
              )}
            </div>

            <p className="text-xs text-white/50 text-center tracking-wide">
              Quét được bằng tất cả App Ngân Hàng (Vietcombank, MB, Techcombank...) & Ví MoMo, ZaloPay
            </p>
          </div>
        </div>
      )}

      {/* Payment Success Celebration Overlay */}
      {showPaymentSuccess && (
        <div className="fixed inset-0 z-[110] bg-[#06080f]/95 flex items-center justify-center p-6 animate-zoom-in backdrop-blur-md">
          <div className="bg-[#0c101d] border-2 border-emerald-400/60 rounded-3xl p-10 max-w-md w-full flex flex-col items-center gap-5 text-center shadow-[0_0_60px_rgba(16,185,129,0.4)]">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-4xl text-emerald-400 animate-bounce">
              ✓
            </div>
            <div>
              <h3 className="text-3xl font-black text-emerald-400 mb-2">ĐÃ THANH TOÁN!</h3>
              <p className="text-white/80 text-base font-medium">Hệ thống đã nhận thanh toán thành công. Chúc bạn có những bức ảnh thật đẹp!</p>
            </div>
            <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-mono font-bold">
              🎉 Xin cảm ơn quý khách!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraScreen;
