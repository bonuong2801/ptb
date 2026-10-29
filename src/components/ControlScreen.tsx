import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, ExternalLink, LayoutDashboard, Trash2, X, Scissors, Printer, FileText } from 'lucide-react';
import { CustomFrameConfig, CHANNEL_NAME } from '../types/booth';
import { SyncService } from '../utils/syncService';
import { generateFinalImage, syncDB } from '../utils/frameRenderer';
import { VisualFrameEditor, ScalablePreview } from './VisualFrameEditor';
import { A4PrintArrangerModal } from './A4PrintArrangerModal';

export function ControlScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [channel, setChannel] = useState<SyncService | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [syncRequest, setSyncRequest] = useState(0);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const savedSessionRef = useRef<string | null>(null);
  
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [sessionDlUrl, setSessionDlUrl] = useState<string>('');

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => localStorage.getItem('selected_camera_id') || '');
  const [isScanningCameras, setIsScanningCameras] = useState(false);
  
  const [isMirrored, setIsMirrored] = useState(true);
  
  const [savedFrames, setSavedFrames] = useState<CustomFrameConfig[]>([{
    id: 'default',
    name: 'Khung Mặc Định',
    frameImage: null,
    totalShots: 4,
    frameShape: 'rectangle',
    photoShapes: ['rectangle', 'rectangle', 'rectangle', 'rectangle'], layoutMode: 'freeform', photoLayouts: [{x: 10, y: 5, width: 80, height: 20}, {x: 10, y: 28, width: 80, height: 20}, {x: 10, y: 51, width: 80, height: 20}, {x: 10, y: 74, width: 80, height: 20}]
  }]);

  const isDbLoadedRef = useRef(false);

  // Tải danh sách Khung từ IndexedDB (syncDB), tránh lỗi QuotaExceededError của localStorage
  useEffect(() => {
    syncDB.get('saved_frames').then((frames) => {
      if (frames && Array.isArray(frames) && frames.length > 0) {
        setSavedFrames(frames);
        setCustomConfig(frames[0]);
      } else {
        const legacy = localStorage.getItem('neobooth_frames');
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            if (parsed && parsed.length > 0) {
              setSavedFrames(parsed);
              setCustomConfig(parsed[0]);
              syncDB.set('saved_frames', parsed);
              localStorage.removeItem('neobooth_frames');
            }
          } catch(e) {}
        }
      }
      isDbLoadedRef.current = true;
    }).catch(err => {
      console.error("Lỗi khi đọc saved_frames từ IndexedDB:", err);
      isDbLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    // Chặn lưu trước khi quá trình nạp ban đầu từ DB hoàn tất (tránh race condition đè mất frames)
    if (!isDbLoadedRef.current) return;
    if (savedFrames && savedFrames.length > 0) {
      syncDB.set('saved_frames', savedFrames);
    }
  }, [savedFrames]);

  // App State is now Mastered here
  const [customConfig, setCustomConfig] = useState<CustomFrameConfig>(savedFrames[0]);
  
  const saveCurrentFrame = () => {
    setSavedFrames(prev => {
      const exists = prev.findIndex(f => f.id === customConfig.id);
      if (exists !== -1) {
         const newArr = [...prev];
         newArr[exists] = customConfig;
         return newArr;
      }
      return [...prev, customConfig];
    });
  };

  const createNewFrame = () => {
     const newFrame: CustomFrameConfig = {
        id: Date.now().toString(),
        name: `Khung Mới ${savedFrames.length + 1}`,
        frameImage: null,
        totalShots: 3,
        frameShape: 'rectangle',
        photoShapes: ['rectangle', 'rectangle', 'rectangle'], layoutMode: 'freeform', photoLayouts: [{x: 10, y: 10, width: 80, height: 20}, {x: 10, y: 40, width: 80, height: 20}, {x: 10, y: 70, width: 80, height: 20}]
     };
     setSavedFrames(prev => [...prev, newFrame]);
     setCustomConfig(newFrame);
  };

  const deleteCurrentFrame = () => {
     if (savedFrames.length <= 1) return; // Don't delete the last one
     const updated = savedFrames.filter(f => f.id !== customConfig.id);
     setSavedFrames(updated);
     setCustomConfig(updated[0]);
  };
  
  const deleteFrame = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (savedFrames.length <= 1) return; // Don't delete the last frame
    setSavedFrames(prev => prev.filter(f => f.id !== id));
    if (customConfig.id === id) {
      setCustomConfig(savedFrames.find(f => f.id !== id) || savedFrames[0]);
    }
  };
  
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSavedCurrentSessionRef = useRef(false);
  
  useEffect(() => {
    if (capturedImages.length === customConfig.totalShots && capturedImages.length > 0 && !isProcessing) {
      generateFinalImage(customConfig, capturedImages).then(async data => {
        setFinalImage(data);
        
        // Chỉ lưu ở ControlScreen nếu đang chạy Standalone (!cameraReady).
        // Khi cameraReady === true, CameraScreen sẽ đảm nhận lưu đầy đủ ảnh kèm BTS video.
        if (window.electronAPI && !cameraReady && !hasSavedCurrentSessionRef.current) {
           hasSavedCurrentSessionRef.current = true;
           const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
           const currentSessionName = `Session_${timestamp}`;
           savedSessionRef.current = currentSessionName;
           await window.electronAPI.saveSession({
              sessionName: currentSessionName,
              finalImage: data,
              rawImages: capturedImages
           });
        }
      });
    } else if (capturedImages.length === 0) {
      setFinalImage(null);
      savedSessionRef.current = null;
      hasSavedCurrentSessionRef.current = false;
    }
  }, [capturedImages, customConfig, isProcessing, cameraReady]);

  // Refs for state inside timeouts
  const stateRef = useRef({ customConfig, capturedImages });
  useEffect(() => { stateRef.current = { customConfig, capturedImages }; }, [customConfig, capturedImages]);

  const handleSelectDevice = (id: string) => {
    setSelectedDeviceId(id);
    localStorage.setItem('selected_camera_id', id);
    const found = devices.find(d => d.deviceId === id);
    if (found && found.label) {
      localStorage.setItem('selected_camera_label', found.label);
    }
  };

  // Enumerate Devices with permission probe and robust device persistence
  const fetchCameras = async () => {
    setIsScanningCameras(true);
    try {
      // 1. Thử probe xin quyền nhẹ để lấy đầy đủ device label (tên camera)
      try {
        const probeStream = await navigator.mediaDevices.getUserMedia({ video: true });
        probeStream.getTracks().forEach(t => t.stop());
      } catch (probeErr) {
        console.warn("Camera probe warning (camera might be busy or in use):", probeErr);
      }

      // 2. Luôn enumerateDevices() để lấy toàn bộ danh sách camera (kể cả khi probe lỗi)
      const devs = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devs.filter(d => d.kind === 'videoinput');
      console.log("[CG] Danh sách camera phát hiện được:", videoDevs.map(d => ({ label: d.label, id: d.deviceId })));
      setDevices(videoDevs);

      // 3. Tự động chọn camera:
      const savedId = localStorage.getItem('selected_camera_id');
      const savedLabel = localStorage.getItem('selected_camera_label');

      setSelectedDeviceId(prev => {
        // Nếu đang chọn 1 ID hợp lệ trong danh sách mới
        if (prev && videoDevs.some(d => d.deviceId === prev)) return prev;

        // Nếu có camera đã lưu theo ID
        if (savedId && videoDevs.some(d => d.deviceId === savedId)) return savedId;

        // Nếu có camera khớp với tên đã lưu (VD: "DroidCam" hoặc "OBS")
        if (savedLabel) {
          const match = videoDevs.find(d => d.label && d.label.toLowerCase().includes(savedLabel.toLowerCase()));
          if (match) {
            localStorage.setItem('selected_camera_id', match.deviceId);
            return match.deviceId;
          }
        }

        // Tự động ưu tiên camera ngoài nếu phát hiện (DroidCam / OBS / EOS / USB Webcam)
        const externalCam = videoDevs.find(d => 
          d.label && /droid|obs|eos|canon|usb|external|webcam|c920|brio/i.test(d.label)
        );
        if (externalCam) {
          localStorage.setItem('selected_camera_id', externalCam.deviceId);
          localStorage.setItem('selected_camera_label', externalCam.label);
          return externalCam.deviceId;
        }

        // Mặc định chọn camera đầu tiên
        const firstId = videoDevs.length > 0 ? videoDevs[0].deviceId : '';
        if (firstId) localStorage.setItem('selected_camera_id', firstId);
        return firstId;
      });
    } catch (err) {
      console.error("Lỗi khi quét danh sách camera:", err);
    } finally {
      setTimeout(() => setIsScanningCameras(false), 500);
    }
  };

  useEffect(() => {
    fetchCameras();
    navigator.mediaDevices.addEventListener('devicechange', fetchCameras);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fetchCameras);
  }, []);

  useEffect(() => {
    if (cameraReady) {
        if (previewStream) {
          previewStream.getTracks().forEach(t => t.stop());
        }
        setPreviewStream(null);
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
    }
    let currentStream: MediaStream | null = null;
    async function setupPreview() {
      try {
        const constraints = selectedDeviceId 
            ? { video: { deviceId: { exact: selectedDeviceId }, width: 1280, height: 720 } }
            : { video: { width: 1280, height: 720, facingMode: "user" } };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = mediaStream;
        setPreviewStream(mediaStream);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (err) {
        console.warn("Admin preview camera access denied.");
      }
    }
    setupPreview();
    return () => { if (currentStream) currentStream.getTracks().forEach(t => t.stop()); };
  }, [selectedDeviceId, cameraReady]);

  useEffect(() => {
    const bc = new SyncService(CHANNEL_NAME);
    setChannel(bc);
    const connectedRef = { current: false };
    let lastPongTime = 0;

    bc.onMessage((data) => {
      const { type, payload } = data;
      if (type === 'PONG') {
        lastPongTime = Date.now();
        if (!connectedRef.current) {
          connectedRef.current = true;
          setCameraReady(true);
          setSyncRequest(prev => prev + 1);
        }
      } else if (type === 'LIVE_FRAME' && payload) {
        setLiveFrame(payload.image);
      } else if (type === 'SESSION_STATE' && payload) {
        if (payload.isSessionActive !== undefined) setIsSessionActive(payload.isSessionActive);
        if (payload.countdown !== undefined) setCountdown(payload.countdown);
        if (payload.currentShotIndex !== undefined) setCurrentShotIndex(payload.currentShotIndex);
        if (payload.isProcessing !== undefined) setIsProcessing(payload.isProcessing);
        if (payload.capturedImages !== undefined) setCapturedImages(payload.capturedImages);
      }
    });

    // Gửi PING lặp lại mỗi 1s cho tới khi nhận được PONG lần đầu.
    // Sau khi kết nối, chuyển sang heartbeat 5s:
    //   - Gửi PING mỗi 5s để kiểm tra Customer Screen còn sống không.
    //   - Nếu không nhận PONG trong 10s → coi như disconnect, reset cameraReady.
    bc.postMessage({ type: 'PING' });
    const retryInterval = setInterval(() => {
      if (!connectedRef.current) {
        bc.postMessage({ type: 'PING' });
      } else {
        clearInterval(retryInterval);
      }
    }, 1000);

    // Heartbeat sau khi đã kết nối
    const heartbeatInterval = setInterval(() => {
      if (connectedRef.current) {
        bc.postMessage({ type: 'PING' });
        // Nếu đã 10s không nhận PONG → Customer Screen đã đóng
        if (lastPongTime > 0 && Date.now() - lastPongTime > 10000) {
          connectedRef.current = false;
          lastPongTime = 0;
          setCameraReady(false);
          setLiveFrame(null);
        }
      }
    }, 5000);

    return () => { clearInterval(retryInterval); clearInterval(heartbeatInterval); bc.close(); };
  }, []);

  // Broadcast Heavy Assets (Config & Captured Images)
  const prevFrameRef = useRef<string | null>(null);

  useEffect(() => {
    if (channel) {
      const broadcastAssets = async () => {
        const payloadConfig = { ...customConfig };
        if (payloadConfig.frameImage) {
            if (payloadConfig.frameImage !== prevFrameRef.current) {
                try {
                   await syncDB.set('shared_frame_image', payloadConfig.frameImage);
                   prevFrameRef.current = payloadConfig.frameImage;
                } catch(e) {}
            }
            payloadConfig.frameImage = 'USE_INDEXEDDB';
        } else {
            prevFrameRef.current = null;
        }

        try {
          channel.postMessage({
            type: 'FRAME_CONFIG_UPDATE',
            payload: {
              customConfig: payloadConfig
            }
          });
        } catch (err) {
          console.error("Broadcast error:", err);
        }
      };
      
      const timeout = setTimeout(broadcastAssets, isEditorOpen ? 250 : 80); // Debounce during rapid slot dragging
      return () => clearTimeout(timeout);
    }
  }, [customConfig, channel, syncRequest, isEditorOpen]);

  // Gửi lựa chọn camera sang Customer Screen — Customer mới là nơi sở hữu
  // camera thật, nên chỉ cần gửi đúng deviceId, không cần gửi lại các state
  // (isSessionActive/countdown/...) vì các state đó giờ do Customer làm chủ.
  useEffect(() => {
    if (channel && cameraReady) {
      try {
        channel.postMessage({ type: 'SELECT_DEVICE', payload: { deviceId: selectedDeviceId } });
        channel.postMessage({ type: 'SET_MIRROR', payload: { isMirrored } });
      } catch (err) {
        console.error("Broadcast device select error:", err);
      }
    }
  }, [selectedDeviceId, isMirrored, channel, cameraReady, syncRequest]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCustomConfig(prev => ({ ...prev, frameImage: ev.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const doCountdownLocal = (shotIndex: number) => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    let count = 5;
    setCountdown(count);
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdown(null);
        takePhotoLocal(shotIndex);
      }
    }, 1000);
  };

  const takePhotoLocal = (shotIndex: number) => {
    if (canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = videoRef.current?.videoWidth || 1280;
        canvas.height = videoRef.current?.videoHeight || 720;
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

        const newImage = canvas.toDataURL('image/jpeg');
        const currState = stateRef.current;
        const updated = [...currState.capturedImages, newImage];
        setCapturedImages(updated);

        if (updated.length < currState.customConfig.totalShots) {
          setTimeout(() => {
            setCurrentShotIndex(updated.length);
            doCountdownLocal(updated.length);
          }, 1000);
        } else {
          setIsProcessing(true);
          processingTimeoutRef.current = setTimeout(() => {
            processingTimeoutRef.current = null;
            setIsProcessing(false);
            setIsSessionActive(false);
          }, 1500);
        }
      }
    }
  };

  const startSession = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    hasSavedCurrentSessionRef.current = false;
    hasShownPrintModalRef.current = false;
    if (cameraReady && channel) {
      channel.postMessage({ type: 'START_SESSION' });
    } else {
      setIsSessionActive(true);
      setCapturedImages([]);
      setCurrentShotIndex(0);
      doCountdownLocal(0);
    }
  };

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isA4ArrangerOpen, setIsA4ArrangerOpen] = useState(false);
  const [printCopies, setPrintCopies] = useState(2);
  const hasShownPrintModalRef = useRef(false);

  // Tự động mở cửa sổ in ảnh khi đã có ảnh hoàn chỉnh (chỉ mở 1 lần mỗi phiên chụp)
  useEffect(() => {
    if (capturedImages.length === customConfig.totalShots && !isSessionActive && !isProcessing && finalImage && !hasShownPrintModalRef.current) {
      hasShownPrintModalRef.current = true;
      setIsPrintModalOpen(true);
      setPrintCopies(2); // Mặc định 2 bản in (cặp đôi)
    } else if (capturedImages.length === 0) {
      hasShownPrintModalRef.current = false;
    }
  }, [capturedImages.length, customConfig.totalShots, isSessionActive, isProcessing, finalImage]);

  const handlePrint = async () => {
    if (!selectedPrinter) {
      alert("Vui lòng chọn máy in ở cột bên trái!");
      return;
    }
    console.log("Đang in khổ gốc...");
    setIsPrintModalOpen(false);
    if (window.electronAPI?.printImage) {
      const result = await window.electronAPI.printImage({ imageBase64: finalImage!, copies: printCopies, printerName: selectedPrinter });
      if (!result.success) alert("Lỗi khi in: " + result.error);
    }
  };

  const handleA4Print = async (a4Base64: string) => {
    if (!selectedPrinter) {
      alert("Vui lòng chọn máy in ở cột bên trái!");
      return;
    }
    console.log("Đang in khổ A4...");
    if (window.electronAPI?.printImage) {
      const result = await window.electronAPI.printImage({ imageBase64: a4Base64, copies: 1, printerName: selectedPrinter });
      if (!result.success) {
        alert("Lỗi khi in A4: " + result.error);
      }
    }
  };

  const [saveDirectory, setSaveDirectory] = useState<string>('');
  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');

  useEffect(() => {
    if (window.electronAPI) {
      if (window.electronAPI.getSaveDirectory) {
        window.electronAPI.getSaveDirectory().then((dir: string) => setSaveDirectory(dir));
      }
      if (window.electronAPI.getPrinters) {
        window.electronAPI.getPrinters().then((p: any[]) => setPrinters(p));
      }
      if (window.electronAPI.getSavedPrinter) {
        window.electronAPI.getSavedPrinter().then((p: string) => {
          if (p) setSelectedPrinter(p);
        });
      }
    }
  }, []);

  const handlePrinterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedPrinter(name);
    if (window.electronAPI?.savePrinter) {
      window.electronAPI.savePrinter(name);
    }
  };

  const handleChangeSaveDirectory = async () => {
    if (window.electronAPI?.selectDirectory) {
      const newDir = await window.electronAPI.selectDirectory();
      if (newDir) setSaveDirectory(newDir);
    }
  };

  const resetSession = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    hasSavedCurrentSessionRef.current = false;
    hasShownPrintModalRef.current = false;
    if (cameraReady && channel) {
      channel.postMessage({ type: 'RESET_SESSION' });
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    setCapturedImages([]);
    setCurrentShotIndex(0);
    setIsSessionActive(false);
    setIsProcessing(false);
  };

  return (
    <div className="flex-1 w-full p-6 max-w-[1440px] mx-auto h-full overflow-y-auto custom-scrollbar">
      {/* Header Bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl liquid-glass flex items-center justify-center border border-cyan-400/30 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
            <LayoutDashboard className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 bg-clip-text text-transparent">NEOBOOTH</h1>
              <span className="liquid-glass-pill px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-cyan-300 border border-cyan-400/30">Admin Control</span>
            </div>
            <p className="text-xs text-white/50 tracking-wide">Optical Glass Photobooth Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!cameraReady && (
            <button 
              onClick={() => {
                if (previewStream) {
                  previewStream.getTracks().forEach(t => t.stop());
                  setPreviewStream(null);
                }
                if (window.electronAPI) {
                  window.electronAPI.openCustomerScreen();
                } else {
                  window.open('?mode=camera', '_blank');
                }
              }}
              className="liquid-glass-pill text-xs font-bold uppercase tracking-wider text-cyan-300 hover:text-white px-4 py-2 hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              Mở màn hình 2
            </button>
          )}
          <div className="liquid-glass-pill text-[11px] flex items-center gap-2.5 text-white/70 px-3.5 py-2">
            <div className={`w-2 h-2 rounded-full ${cameraReady ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse' : 'bg-neutral-500'}`}></div> 
            <span className="font-mono tracking-wider text-[10px]">{cameraReady ? 'CUSTOMER SCREEN SYNCED' : 'STANDALONE MODE'}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 pb-8 min-h-[850px]">
        {/* Left Column: Config Builder & Strip Preview */}
        <div className="flex-[1.2] flex flex-col gap-4">
           
           <div className="liquid-glass rounded-2xl p-5 shrink-0 flex flex-row justify-between items-center">
              <div className="flex flex-col overflow-hidden mr-4">
                <h2 className="card-title text-cyan-400">Nơi lưu ảnh & Video</h2>
                <p className="text-[11px] font-mono text-cyan-100/70 mt-0.5 truncate" title={saveDirectory}>{saveDirectory || 'Mặc định (Pictures/CGBOOTH)'}</p>
              </div>
              <button 
                onClick={handleChangeSaveDirectory} 
                className="liquid-glass-pill shrink-0 text-cyan-300 hover:text-white font-bold text-[10px] uppercase px-3.5 py-1.5 hover:border-cyan-400/40 transition-all cursor-pointer"
              >
                Đổi thư mục
              </button>
           </div>

           <div className="liquid-glass rounded-2xl p-5 shrink-0 flex flex-row justify-between items-center">
              <div className="flex flex-col">
                <h2 className="card-title text-cyan-400">Cài đặt Frame</h2>
                <p className="text-xs text-white/60 mt-0.5 font-medium">{customConfig.name} ({customConfig.totalShots} ảnh)</p>
              </div>
              <button 
                onClick={() => setIsEditorOpen(true)} 
                className="liquid-btn-cyber text-xs uppercase px-4 py-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.25)]"
              >
                Cấu hình frame
              </button>
           </div>

           <div className="liquid-glass rounded-2xl p-5 shrink-0 flex flex-col gap-2">
              <h2 className="card-title text-cyan-400">Máy in ngầm (Silent Print)</h2>
              <select 
                value={selectedPrinter} 
                onChange={handlePrinterChange}
                className="liquid-glass text-white text-xs px-3.5 py-2.5 rounded-xl border border-white/15 focus:outline-none focus:border-cyan-400 cursor-pointer transition-colors"
              >
                <option value="" className="bg-[#080a12] text-white">-- Chọn máy in --</option>
                {printers.map((p, i) => (
                  <option key={i} value={p.name} className="bg-[#080a12] text-white">{p.name}</option>
                ))}
              </select>
           </div>

           {/* Saved Frames List */}
           <div className="liquid-glass rounded-2xl p-5 shrink-0 max-h-48 overflow-y-auto custom-scrollbar">
              <h2 className="card-title text-cyan-400 mb-3">Frame ({savedFrames.length})</h2>
              <div className="flex flex-col gap-2">
                {savedFrames.map(frame => (
                   <div key={frame.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${customConfig.id === frame.id ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.07] hover:text-white'}`}>
                     <button 
                       onClick={() => setCustomConfig(frame)}
                       disabled={isSessionActive}
                       className="flex-1 flex items-center justify-between text-left focus:outline-none cursor-pointer"
                     >
                       <span className="font-medium">{frame.name}</span>
                       <span className="text-[10px] opacity-70 font-mono">{frame.totalShots} ảnh</span>
                     </button>
                     {savedFrames.length > 1 && (
                       <button onClick={(e) => deleteFrame(frame.id, e)} className="p-1 hover:text-red-400 text-white/40 transition-colors cursor-pointer" title="Xóa Frame">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     )}
                   </div>
                ))}
              </div>
           </div>

           <div className="liquid-glass rounded-2xl p-5 flex flex-col flex-1 min-h-[400px] relative">
             <h2 className="card-title text-cyan-400 mb-4 text-center shrink-0">Xem trước Photo Strip</h2>
             <div className="flex-1 overflow-hidden flex flex-col items-center p-4 bg-black/40 rounded-xl relative">
                <div className="absolute inset-0 p-4">
                  <ScalablePreview config={customConfig} capturedImages={capturedImages} />
                </div>
             </div>
           </div>
        </div>

        {/* Right Column: Process & Camera */}
        <div className="flex-[2] flex flex-col gap-4">
           <div className="liquid-glass rounded-3xl overflow-hidden relative shadow-2xl flex-1 min-h-[320px]">
             {/* Floating Camera HUD */}
             <div className="absolute top-3 right-3 liquid-glass-pill px-3 py-1.5 flex items-center gap-2.5 z-30 border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <button 
                 onClick={fetchCameras} 
                 disabled={isScanningCameras}
                 className={`text-white/70 hover:text-cyan-400 p-1 rounded-full transition-all cursor-pointer ${isScanningCameras ? 'animate-spin text-cyan-400' : ''}`}
                 title="Làm mới / Quét tìm Camera (DroidCam, OBS, USB...)"
               >
                 <RefreshCw className="w-3.5 h-3.5" />
               </button>
               <div className="flex items-center gap-1.5">
                 <select 
                   className="bg-transparent text-white/90 rounded outline-none font-mono text-[11px] max-w-[220px] overflow-hidden text-ellipsis cursor-pointer font-bold"
                   value={selectedDeviceId}
                   onChange={e => handleSelectDevice(e.target.value)}
                 >
                   <option value="" className="bg-[#080a12] text-white">Default Camera</option>
                   {devices.map(d => (
                     <option key={d.deviceId} value={d.deviceId} className="bg-[#080a12] text-white">
                       {d.label || `Camera (${d.deviceId.slice(0, 8)}...)`}
                     </option>
                   ))}
                 </select>
                 {devices.length > 0 && (
                   <span className="text-[9px] font-mono font-bold bg-white/10 text-cyan-300 px-1.5 py-0.5 rounded-md border border-white/10 shrink-0">
                     {devices.length} cam
                   </span>
                 )}
               </div>
               <div className="w-px h-3 bg-white/20" />
               <button
                 type="button"
                 onClick={() => setIsMirrored(prev => !prev)}
                 className={`px-2 py-0.5 rounded-full text-[9px] font-mono border transition-all cursor-pointer ${isMirrored ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40 font-bold' : 'bg-white/5 text-white/50 border-white/10'}`}
                 title="Bật/Tắt lật gương camera"
               >
                 {isMirrored ? 'GƯƠNG: BẬT' : 'GƯƠNG: TẮT'}
               </button>
               <div className="w-px h-3 bg-white/20" />
               <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 font-bold">
                 <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                 LIVE
               </span>
             </div>
             
             {cameraReady ? (
               /* Screen 2 kết nối → hiện live frame từ Screen 2 */
               liveFrame ? (
                 <img src={liveFrame} className="w-full h-full object-contain bg-black opacity-90" alt="Live View" />
               ) : (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/40 text-xs uppercase tracking-widest font-mono">
                   [Waiting for Customer Camera...]
                 </div>
               )
             ) : (
               /* Standalone → hiện trực tiếp camera của máy */
               <>
                 <video
                   ref={videoRef}
                   autoPlay playsInline muted
                   className={`w-full h-full object-contain bg-black transition-transform duration-300 ${isMirrored ? '-scale-x-100' : ''}`}
                 />
                 <canvas ref={canvasRef} className="hidden" />
                 {!previewStream && (
                   <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/40 text-xs uppercase tracking-widest font-mono animate-pulse">
                     [Initializing Optical Camera...]
                   </div>
                 )}
               </>
             )}

             {countdown !== null && (
                <div key={countdown} className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none animate-countdown-pop">
                  <div className="liquid-lens-countdown">
                    <span className="text-8xl font-black text-white text-glow-cyan leading-none select-none">{countdown}</span>
                  </div>
                </div>
              )}
           </div>

           <div className="flex gap-4 shrink-0">
             <div className="liquid-glass rounded-2xl p-5 flex-1 flex flex-col h-40">
                {capturedImages.length === customConfig.totalShots && !isProcessing ? (
                  <div className="flex items-center gap-4 h-full">
                    <div className="flex flex-col justify-center">
                      <h2 className="text-cyan-400 font-bold mb-1 uppercase tracking-widest text-lg">Session Complete</h2>
                      <p className="text-white/60 text-sm mb-2">Đã tự động hiển thị bảng in ảnh.</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {finalImage && window.electronAPI ? (
                          <p className="text-cyan-300 text-sm font-bold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
                            Đã lưu ảnh vào ổ cứng
                          </p>
                        ) : (
                          <a href={finalImage || '#'} download="neobooth-strip.png" className="text-white text-sm underline underline-offset-2 hover:text-cyan-300">Tải về thủ công</a>
                        )}
                        {finalImage && (
                          <button
                            onClick={() => setIsA4ArrangerOpen(true)}
                            className="px-3 py-1 rounded-xl liquid-glass-pill hover:border-cyan-400 text-cyan-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            <span>Sắp xếp in A4</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="card-title text-cyan-400 mb-2">Process Log</h2>
                    <div className="flex-1 overflow-y-auto pr-2 text-sm custom-scrollbar">
                        <div className="log-entry">[SYSTEM] Optical Glass Engine Initialized</div>
                        {cameraReady ? <div className="log-entry text-cyan-400 font-semibold">[SYNC] Customer Screen Connected</div> : <div className="log-entry text-neutral-400">[SYNC] Customer Screen not detected. Standalone mode.</div>}
                        {countdown !== null && <div className="log-entry text-cyan-300">[PROCESS] Triggering Shot {currentShotIndex + 1}/{customConfig.totalShots}...</div>}
                        {isProcessing && <div className="log-entry text-cyan-400 font-bold">[PROCESS] Rendering Final Strip...</div>}
                    </div>
                  </>
                )}
             </div>
            
             <div className="flex-1 flex flex-col justify-end">
                {/* Nút CHỤP: hiện khi chưa có ảnh, đang chụp, hoặc đang processing (chờ render) */}
                {(capturedImages.length === 0 || isSessionActive || isProcessing) && (
                   <button
                    onClick={startSession}
                    disabled={isSessionActive || isProcessing}
                    className={`liquid-btn-cyber w-full flex items-center justify-center gap-3 text-base py-5 transition-all h-full shadow-[0_0_35px_rgba(6,182,212,0.35)] ${
                      isProcessing ? 'opacity-60 cursor-wait' : ''
                    }`}
                   >
                    <Camera className={`w-5 h-5 text-cyan-200 ${isProcessing ? 'animate-pulse' : ''}`} />
                    {isProcessing ? 'ĐANG XỬ LÝ...' : `BẮT ĐẦU CHỤP (${customConfig.totalShots} ẢNH)`}
                   </button>
                )}
                {/* Nút RESET: hiện khi chụp xong và không còn đang xử lý */}
                {capturedImages.length === customConfig.totalShots && !isSessionActive && !isProcessing && (
                   <button
                    onClick={resetSession}
                    className="liquid-btn-reset w-full flex items-center justify-center gap-3 text-base py-5 h-full"
                   >
                    <RefreshCw className="w-5 h-5" />
                    PHIÊN MỚI (RESET)
                   </button>
                )}
             </div>
           </div>
        </div>

      </div>

      {/* Editor Modal Overlay */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-zoom-in">
          <div animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="liquid-glass border border-white/20 p-6 rounded-3xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col gap-6 shadow-[0_25px_60px_rgba(0,0,0,0.7)]">
              <div className="flex justify-between items-center border-b border-white/10 pb-4 shrink-0">
                <h2 className="text-xl font-black text-cyan-400 uppercase tracking-widest">Visual Frame Editor</h2>
                <div className="flex items-center gap-3">
                   <input type="text" value={customConfig.name} onChange={e => setCustomConfig(prev => ({...prev, name: e.target.value}))} className="liquid-glass border border-white/15 rounded-xl px-3.5 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-400 w-48" placeholder="Tên Frame..." />
                   <button onClick={saveCurrentFrame} className="liquid-btn-cyber text-xs uppercase px-4 py-2 cursor-pointer">Lưu</button>
                   <button onClick={createNewFrame} className="liquid-glass-pill text-white/80 hover:text-white font-bold text-xs uppercase px-4 py-2 hover:border-cyan-400/40 transition-all cursor-pointer">Mới</button>
                   <div className="w-px h-6 bg-white/20 mx-1"></div>
                   <button onClick={() => { saveCurrentFrame(); setIsEditorOpen(false); }} className="liquid-glass-pill text-white/60 hover:text-white transition-all p-2 cursor-pointer hover:border-white/30" title="Đóng và lưu">
                      <X className="w-4 h-4" />
                   </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[400px]">
                 <VisualFrameEditor config={customConfig} setConfig={setCustomConfig} />
              </div>
            </div>
        </div>
      )}

      {/* Bước 1: Modal Chọn Số Lượng Bản In */}
      {isPrintModalOpen && finalImage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-zoom-in">
          <div className="liquid-glass border border-white/20 p-7 rounded-3xl w-full max-w-lg flex flex-col gap-5 shadow-[0_25px_60px_rgba(0,0,0,0.8)] items-center">
              <div className="text-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-300 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/20">
                  Bước 1/2: Chọn số lượng bản in
                </span>
                <h2 className="text-2xl font-black text-white uppercase tracking-wider mt-2">CẤU HÌNH IN ẢNH</h2>
              </div>
              
              <div className="w-full bg-black/40 rounded-2xl p-4 flex justify-center border border-white/10 shadow-inner">
                <img src={finalImage} alt="Preview" className="max-h-[26vh] object-contain rounded-lg drop-shadow-2xl" />
              </div>

              {/* Bộ chọn số lượng in */}
              <div className="flex flex-col gap-2 w-full text-center">
                <p className="text-xs text-white/70 uppercase tracking-widest font-mono">SỐ LƯỢNG BẢN IN DẢI ẢNH</p>
                <div className="flex items-center justify-center gap-6 mt-1">
                  <button onClick={() => setPrintCopies(Math.max(1, printCopies - 1))} className="liquid-glass-pill text-cyan-300 hover:text-white w-12 h-12 flex items-center justify-center text-2xl transition-all cursor-pointer active:scale-90 border border-cyan-400/30">-</button>
                  <span className="text-5xl font-black text-white w-16 text-center text-glow-cyan">{printCopies}</span>
                  <button onClick={() => setPrintCopies(printCopies + 1)} className="liquid-glass-pill text-cyan-300 hover:text-white w-12 h-12 flex items-center justify-center text-2xl transition-all cursor-pointer active:scale-90 border border-cyan-400/30">+</button>
                </div>

                {/* Phím tắt số lượng nhanh */}
                <div className="flex items-center justify-center gap-2 mt-1">
                  {[1, 2, 4, 5].map((num) => (
                    <button
                      key={num}
                      onClick={() => setPrintCopies(num)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        printCopies === num 
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40' 
                          : 'liquid-glass-pill text-white/60 hover:text-white'
                      }`}
                    >
                      {num} Bản
                    </button>
                  ))}
                </div>
              </div>

              {/* Các nút hành động */}
              <div className="flex flex-col gap-2.5 w-full mt-2">
                {/* Nút chính: Chuyển sang Bước 2 Dàn trang A4 */}
                <button 
                  onClick={() => {
                    setIsPrintModalOpen(false);
                    setIsA4ArrangerOpen(true);
                  }}
                  className="w-full liquid-btn-cyber py-4 rounded-2xl font-black tracking-wider transition-all uppercase text-sm sm:text-base cursor-pointer shadow-[0_0_25px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2"
                >
                  <Scissors className="w-5 h-5" />
                  <span>SẮP XẾP TRÊN GIẤY A4 ĐỂ IN</span>
                </button>

                {/* Các tùy chọn phụ */}
                <div className="flex gap-2.5 w-full">
                  <button 
                    onClick={() => setIsPrintModalOpen(false)} 
                    className="flex-1 liquid-glass-pill text-white/70 hover:text-white py-3 rounded-xl font-bold tracking-wider transition-all uppercase text-xs cursor-pointer"
                  >
                    Bỏ qua
                  </button>
                  
                  <button 
                    onClick={handlePrint} 
                    className="flex-1 liquid-glass-pill text-cyan-300 hover:text-white hover:border-cyan-400/40 py-3 rounded-xl font-bold tracking-wider transition-all uppercase text-xs cursor-pointer flex items-center justify-center gap-1.5"
                    title="In trực tiếp nếu dùng máy in nhiệt chuyên dụng 5x15cm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In Khổ Gốc (5x15)</span>
                  </button>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* Bước 2: Modal Dàn trang & Kéo thả các dải ảnh trên khổ giấy A4 */}
      {finalImage && (
        <A4PrintArrangerModal
          isOpen={isA4ArrangerOpen}
          onClose={() => setIsA4ArrangerOpen(false)}
          finalImage={finalImage}
          initialCopies={printCopies}
          selectedPrinter={selectedPrinter}
          onConfirmPrint={handleA4Print}
        />
      )}
    </div>
  );
}

export default ControlScreen;
