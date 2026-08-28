import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Camera, RefreshCw, ExternalLink, Monitor, LayoutDashboard, Upload, QrCode, Download, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';

declare global {
  interface Window {
    electronAPI?: {
      saveSession: (data: any) => Promise<{success: boolean, folderPath?: string, error?: string}>;
      openCustomerScreen: () => void;
      broadcastSync: (data: any) => void;
      onSyncReceived: (callback: (data: any) => void) => void;
      getPrinters?: () => Promise<any[]>;
      printImage?: (data: any) => Promise<{success: boolean, error?: string}>;
      getSavedPrinter?: () => Promise<string>;
      savePrinter?: (name: string) => Promise<boolean>;
    };
  }
}

class SyncService {
  private channel: BroadcastChannel | null = null;
  private onMessageCallback: ((data: any) => void) | null = null;

  constructor(channelName: string) {
    if (window.electronAPI) {
      window.electronAPI.onSyncReceived((data) => {
        if (this.onMessageCallback) this.onMessageCallback(data);
      });
    } else {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = (event) => {
        if (this.onMessageCallback) this.onMessageCallback(event.data);
      };
    }
  }

  postMessage(data: any) {
    if (window.electronAPI) {
      window.electronAPI.broadcastSync(data);
    } else if (this.channel) {
      this.channel.postMessage(data);
    }
  }

  onMessage(callback: (data: any) => void) {
    this.onMessageCallback = callback;
  }

  close() {
    if (this.channel) {
      this.channel.close();
    }
  }
}


type FrameShape = 'rectangle' | 'square';
type PhotoShape = 'rectangle' | 'square' | 'circle';

interface CustomFrameConfig {
  id: string;
  name: string;
  frameImage: string | null;
  totalShots: number;
  frameShape: FrameShape;
  photoShapes: PhotoShape[];
  layoutMode?: 'grid' | 'freeform';
  photoLayouts?: { x: number; y: number; width: number; height: number; }[];
  frameLayering?: 'above' | 'below';
}

type ViewMode = 'control' | 'camera';
const CHANNEL_NAME = 'photobooth-sync';

// Utility to compose final strip
const generateFinalImage = async (config: CustomFrameConfig, capturedImages: string[]): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const isSquare = config.frameShape === 'square';
    canvas.width = 1200;
    canvas.height = isSquare ? 1200 : 3600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve('');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const layouts = config.photoLayouts || [];
    
    const drawPhotos = async () => {
      for (let i = 0; i < config.totalShots; i++) {
        const captured = capturedImages[i];
        const layout = layouts[i];
        if (captured && layout) {
          await new Promise<void>((res) => {
            const img = new Image();
            img.onload = () => {
              const x = (layout.x / 100) * canvas.width;
              const y = (layout.y / 100) * canvas.height;
              const w = (layout.width / 100) * canvas.width;
              const h = (layout.height / 100) * canvas.height;

              ctx.save();
              if (config.photoShapes[i] === 'circle') {
                ctx.beginPath();
                ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
                ctx.clip();
              }
              // Object-cover crop logic
              const imgAspect = img.width / img.height;
              const slotAspect = w / h;
              let sWidth = img.width;
              let sHeight = img.height;
              let sx = 0, sy = 0;
              
              if (imgAspect > slotAspect) {
                sWidth = img.height * slotAspect;
                sx = (img.width - sWidth) / 2;
              } else {
                sHeight = img.width / slotAspect;
                sy = (img.height - sHeight) / 2;
              }
              
              ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
              ctx.restore();
              res();
            };
            img.onerror = () => { res(); };
            img.src = captured;
          });
        }
      }
    };

    const drawFrame = async () => {
      if (config.frameImage) {
        await new Promise<void>((res) => {
          const frameImg = new Image();
          frameImg.onload = () => {
            ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
            res();
          };
          frameImg.src = config.frameImage!;
        });
      }
    };

    const layerMode = config.frameLayering || 'above';
    if (layerMode === 'above') {
       drawPhotos().then(() => drawFrame()).then(() => resolve(canvas.toDataURL('image/png')));
    } else {
       drawFrame().then(() => drawPhotos()).then(() => resolve(canvas.toDataURL('image/png')));
    }
  });
};

// Quick IndexedDB wrapper for large images bypassing localStorage limits
const syncDB = {
  async init() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('photobooth_sync', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('assets');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async set(key: string, value: any) {
    const db = await this.init();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async get(key: string) {
    const db = await this.init();
    return new Promise<any>((resolve, reject) => {
      const tx = db.transaction('assets', 'readonly');
      const req = tx.objectStore('assets').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
};

// Shared Strip Preview Component
function StripPreview({ config, capturedImages, className = "" }: { config: CustomFrameConfig, capturedImages: string[], className?: string }) {
  const isSquareFrame = config.frameShape === 'square';
  const aspectClass = isSquareFrame ? 'aspect-square' : 'aspect-[1/3]';
  const currentLayouts = config.photoLayouts || Array.from({length: config.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15 }));

  return (
    <div className={`relative bg-transparent overflow-hidden shrink-0 w-full ${aspectClass} ${className}`}>
      <div className="absolute inset-0 z-10 w-full h-full">
        {currentLayouts.map((layout, idx) => {
           if (idx >= config.totalShots) return null;
           const captured = capturedImages[idx];
           const shape = config.photoShapes[idx] || 'rectangle';
           return (
              <div key={idx} className={`absolute overflow-hidden flex items-center justify-center ${shape === 'circle' ? 'rounded-full' : ''} bg-transparent`} style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%` }}>
                 {captured ? (
                    <motion.img initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} src={captured} className="w-full h-full object-cover" />
                 ) : (
                    <div className="w-full h-full bg-transparent"></div>
                 )}
              </div>
           )
        })}
      </div>
      {config.frameImage && (
         <img src={config.frameImage} className={`absolute inset-0 w-full h-full object-fill pointer-events-none ${config.frameLayering === 'below' ? 'z-0' : 'z-20'}`} alt="Frame" />
      )}
    </div>
  );
}

// Auto-scaling wrapper for perfect fit
function ScalablePreview({ config, capturedImages }: { config: CustomFrameConfig, capturedImages: string[] }) {
  const isSquareFrame = config.frameShape === 'square';
  const aspectClass = isSquareFrame ? 'aspect-square' : 'aspect-[1/3]';

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      <div 
        className={`relative shrink-0 ${aspectClass}`}
        style={{ 
          maxHeight: '100%', 
          maxWidth: '100%', 
          height: '100%' 
        }}
      >
         <StripPreview 
            config={config} 
            capturedImages={capturedImages} 
            className="!absolute !inset-0 !w-full !h-full" 
         />
      </div>
    </div>
  );
}

function VisualFrameEditor({ config, setConfig }: { config: CustomFrameConfig, setConfig: React.Dispatch<React.SetStateAction<CustomFrameConfig>> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);

  // Drag State
  const dragRef = useRef<{
    idx: number,
    type: 'drag' | 'resize',
    startX: number,
    startY: number,
    initX: number,
    initY: number,
    initW: number,
    initH: number
  } | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const { idx, type, startX, startY, initX, initY, initW, initH } = dragRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      
      const dx = ((e.clientX - startX) / rect.width) * 100;
      const dy = ((e.clientY - startY) / rect.height) * 100;

      setConfig(prev => {
         const newLayouts = [...(prev.photoLayouts || [])];
         const layout = newLayouts[idx] || { x: 10, y: 10, width: 80, height: 15 };
         if (type === 'drag') {
            newLayouts[idx] = { ...layout, x: Math.max(0, Math.min(100 - layout.width, initX + dx)), y: Math.max(0, Math.min(100 - layout.height, initY + dy)) };
         } else if (type === 'resize') {
            newLayouts[idx] = { ...layout, width: Math.max(5, Math.min(100 - layout.x, initW + dx)), height: Math.max(5, Math.min(100 - layout.y, initH + dy)) };
         }
         return { ...prev, photoLayouts: newLayouts };
      });
    };

    const handleUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [setConfig]);

  // ── Zoom bằng Ctrl + scroll ──────────────────────────────────────────────
  const [zoomLevel, setZoomLevel] = useState(1);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollWrapperRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoomLevel(prev => {
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        return Math.min(5, Math.max(0.4, parseFloat((prev + delta).toFixed(2))));
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);
  // ────────────────────────────────────────────────────────────────────────
  const addSlot = () => {
     setConfig(prev => {
        const currentLayouts = prev.photoLayouts || Array.from({length: prev.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15 }));
        const newLayouts = [...currentLayouts, { x: 20, y: 20, width: 30, height: 20 }];
        const newShapes = [...prev.photoShapes, 'rectangle' as PhotoShape];
        return { ...prev, totalShots: newLayouts.length, photoLayouts: newLayouts, photoShapes: newShapes, layoutMode: 'freeform' };
     });
  };

  const removeSlot = (idx: number) => {
     setConfig(prev => {
        const currentLayouts = prev.photoLayouts || Array.from({length: prev.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15 }));
        const newLayouts = [...currentLayouts];
        newLayouts.splice(idx, 1);
        const newShapes = [...prev.photoShapes];
        newShapes.splice(idx, 1);
        return { ...prev, totalShots: newLayouts.length, photoLayouts: newLayouts, photoShapes: newShapes };
     });
     setActiveSlotIdx(null);
  };

  const toggleShape = (idx: number) => {
     setConfig(prev => {
        const newShapes = [...prev.photoShapes];
        newShapes[idx] = newShapes[idx] === 'circle' ? 'rectangle' : 'circle';
        return { ...prev, photoShapes: newShapes };
     });
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig(prev => ({...prev, frameImage: reader.result as string}));
      };
      reader.readAsDataURL(file);
    }
  };

  const currentLayouts = config.photoLayouts || Array.from({length: config.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15 }));
  const aspectClass = config.frameShape === 'square' ? 'aspect-square' : 'aspect-[1/3]';

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/10">
         <div>
            <label className="text-xs text-white/50 uppercase tracking-widest block mb-1">Khung ảnh (Frame PNG)</label>
            <div className="flex items-center gap-2">
               <label className="flex items-center gap-2 cursor-pointer bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-sm transition-colors">
                  <Upload className="w-4 h-4 text-amber-glow" />
                  <span className="text-white/80">{config.frameImage ? 'Đổi Frame' : 'Tải Frame lên'}</span>
                  <input type="file" accept="image/png" onChange={handleFileUpload} className="hidden" />
               </label>
               {config.frameImage && (
                 <button onClick={() => setConfig(prev => ({...prev, frameImage: null}))} className="text-[10px] text-red-400 hover:bg-red-500/20 px-2 py-1 rounded transition-colors">Xoá Ảnh</button>
               )}
            </div>
         </div>
         <div className="flex flex-col items-end gap-2">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest block mb-1">Tỉ Lệ Khung</label>
              <div className="flex bg-black/50 p-1 rounded">
                 <button onClick={() => setConfig(prev => ({...prev, frameShape: 'rectangle'}))} className={`px-2 py-1 text-[10px] font-bold rounded ${config.frameShape === 'rectangle' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}`}>Chữ Nhật</button>
                 <button onClick={() => setConfig(prev => ({...prev, frameShape: 'square'}))} className={`px-2 py-1 text-[10px] font-bold rounded ${config.frameShape === 'square' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}`}>Vuông</button>
              </div>
            </div>
            
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest block mb-1">Vị trí Khung</label>
              <div className="flex bg-black/50 p-1 rounded">
                 <button onClick={() => setConfig(prev => ({...prev, frameLayering: 'above'}))} className={`px-2 py-1 text-[10px] font-bold rounded ${(!config.frameLayering || config.frameLayering === 'above') ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}`}>Đè Lên Ảnh</button>
                 <button onClick={() => setConfig(prev => ({...prev, frameLayering: 'below'}))} className={`px-2 py-1 text-[10px] font-bold rounded ${config.frameLayering === 'below' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}`}>Nằm Dưới Ảnh</button>
              </div>
            </div>
         </div>
      </div>

      {/* Canvas khu vực — Ctrl+scroll để zoom */}
      <div
        ref={scrollWrapperRef}
        className="w-full bg-black/40 rounded-xl border border-white/10 overflow-auto"
        style={{ maxHeight: '480px' }}
      >
        {/* Zoom indicator */}
        <div className="sticky top-0 left-0 z-50 flex items-center justify-between px-3 py-1.5 bg-black/70 backdrop-blur-sm border-b border-white/10">
          <span className="text-[10px] text-white/40 uppercase tracking-widest">Ctrl + cuộn chuột để zoom</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-amber-glow">{Math.round(zoomLevel * 100)}%</span>
            {zoomLevel !== 1 && (
              <button
                onClick={() => setZoomLevel(1)}
                className="text-[10px] text-white/50 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="p-4 flex justify-center">
          <div
            ref={containerRef}
            className={`relative ${aspectClass} bg-white shadow-inner select-none touch-none`}
            style={{ width: `${(config.frameShape === 'square' ? 200 : 120) * zoomLevel}px`, flexShrink: 0 }}
          >
            {/* Frame Image overlay — chỉ hiện ở đây khi frame nằm DƯỚI ảnh */}
            {config.frameImage && config.frameLayering === 'below' && (
              <img src={config.frameImage} className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none" alt="Frame Overlay" />
            )}

            {/* Photo Slots (On top of the frame) */}
            <div className="absolute inset-0 z-10 w-full h-full">
              {currentLayouts.map((layout, idx) => {
                 const isActive = activeSlotIdx === idx;
                 const isCircle = config.photoShapes[idx] === 'circle';
                 return (
                   <div
                     key={idx}
                     onPointerDown={(e) => {
                        e.stopPropagation();
                        setActiveSlotIdx(idx);
                        dragRef.current = { idx, type: 'drag', startX: e.clientX, startY: e.clientY, initX: layout.x, initY: layout.y, initW: layout.width, initH: layout.height };
                     }}
                     className={`absolute cursor-move border-[2px] ${isActive ? 'border-amber-glow bg-amber-glow/20 z-30' : 'border-black/30 bg-black/10 hover:border-amber-glow/50 z-10'} ${isCircle ? 'rounded-full' : 'rounded-none'}`}
                     style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%` }}
                   >
                      <div className="absolute inset-0 flex items-center justify-center text-black/40 font-black text-xl pointer-events-none">{idx + 1}</div>
                      
                      {/* Active Controls */}
                      {isActive && (
                        <>
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex gap-1 bg-black rounded p-1 z-50 whitespace-nowrap">
                             <button onClick={(e) => { e.stopPropagation(); toggleShape(idx); }} className="px-2 py-1 text-[10px] text-white hover:bg-white/20 rounded">
                               {isCircle ? 'Đổi Vuông' : 'Đổi Tròn'}
                             </button>
                             <button onClick={(e) => { e.stopPropagation(); removeSlot(idx); }} className="px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/20 rounded">
                               Xóa
                             </button>
                          </div>
                          {/* Resize Handle */}
                          <div
                            onPointerDown={(e) => {
                               e.stopPropagation();
                               dragRef.current = { idx, type: 'resize', startX: e.clientX, startY: e.clientY, initX: layout.x, initY: layout.y, initW: layout.width, initH: layout.height };
                            }}
                            className="absolute -right-2 -bottom-2 w-5 h-5 bg-amber-glow border-2 border-black rounded-full cursor-nwse-resize shadow-md"
                          />
                        </>
                      )}
                   </div>
                 )
              })}
            </div>

            {/* Frame Image overlay — hiện ở đây khi frame ĐÈ LÊN ảnh (mặc định) */}
            {config.frameImage && (!config.frameLayering || config.frameLayering === 'above') && (
              <img src={config.frameImage} className="absolute inset-0 w-full h-full object-fill z-20 pointer-events-none" alt="Frame Overlay" />
            )}

            {(!config.frameImage && currentLayouts.length === 0) && (
               <div className="absolute inset-0 flex flex-col items-center justify-center text-black/30 text-xs p-4 text-center pointer-events-none font-medium z-30">
                  Kéo Frame của bạn vào đây hoặc tạo vùng ghép ảnh trước
               </div>
            )}
          </div>
        </div>
      </div>

      <button onClick={addSlot} className="w-full py-3 bg-amber-glow/10 hover:bg-amber-glow/20 text-amber-glow font-bold rounded-lg text-sm border border-amber-glow/30 transition-colors">
         + Thêm Vùng Ghép Ảnh
      </button>
    </div>
  )
}

export default function WebPrototype() {
  const [viewMode, setViewMode] = useState<ViewMode>('control');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'camera') {
      setViewMode('camera');
    } else {
      setViewMode('control');
    }
  }, []);

  if (viewMode === 'control') return <ControlScreen />;
  if (viewMode === 'camera') return <CameraScreen />;
  
  return null;
}

// -------------------------------------------------------------
// CONTROL SCREEN (Admin)
// -------------------------------------------------------------
function ControlScreen() {
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
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  const [savedFrames, setSavedFrames] = useState<CustomFrameConfig[]>(() => {
    const saved = localStorage.getItem('neobooth_frames');
    if (saved) {
       try {
         const parsed = JSON.parse(saved);
         if (parsed && parsed.length > 0) return parsed;
       } catch(e) {}
    }
    return [{
      id: 'default',
      name: 'Khung Mặc Định',
      frameImage: null,
      totalShots: 4,
      frameShape: 'rectangle',
      photoShapes: ['rectangle', 'rectangle', 'rectangle', 'rectangle'], layoutMode: 'freeform', photoLayouts: [{x: 10, y: 5, width: 80, height: 20}, {x: 10, y: 28, width: 80, height: 20}, {x: 10, y: 51, width: 80, height: 20}, {x: 10, y: 74, width: 80, height: 20}]
    }];
  });
  
  useEffect(() => {
    localStorage.setItem('neobooth_frames', JSON.stringify(savedFrames));
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
  
  useEffect(() => {
    if (capturedImages.length === customConfig.totalShots && capturedImages.length > 0 && !isProcessing) {
      generateFinalImage(customConfig, capturedImages).then(async data => {
        setFinalImage(data);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const currentSessionName = `Session_${timestamp}`;
        
        
        // --- ELECTRON AUTO-SAVE LOGIC ---
        if ((window as any).electronAPI && savedSessionRef.current !== currentSessionName) {
           savedSessionRef.current = currentSessionName;
           const result = await (window as any).electronAPI.saveSession({
              sessionName: currentSessionName,
              finalImage: data,
              rawImages: capturedImages
           });
           
           if ((window as any).electronAPI.getTunnelUrl) {
             const tunnelUrl = await (window as any).electronAPI.getTunnelUrl();
             if (tunnelUrl) {
                setSessionDlUrl(`${tunnelUrl}?id=${currentSessionName}`);
             } else {
                setSessionDlUrl("Đang tạo link, vui lòng thử lại...");
             }
           } else {
             setSessionDlUrl("");
           }
        }
      });
    } else if (capturedImages.length === 0) {
      setFinalImage(null);
      setSessionDlUrl('');
      savedSessionRef.current = null;
    }
  }, [capturedImages, customConfig, isProcessing]);

  // Refs for state inside timeouts
  const stateRef = useRef({ customConfig, capturedImages });
  useEffect(() => { stateRef.current = { customConfig, capturedImages }; }, [customConfig, capturedImages]);

  // Enumerate Devices
  const fetchCameras = () => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((s) => {
      s.getTracks().forEach(t => t.stop());
      navigator.mediaDevices.enumerateDevices().then(devs => {
         const videoDevs = devs.filter(d => d.kind === 'videoinput');
         setDevices(videoDevs);
         setSelectedDeviceId(prev => {
            if (!prev && videoDevs.length > 0) return videoDevs[0].deviceId;
            return prev;
         });
      });
    }).catch(console.warn);
  };

  useEffect(() => {
    fetchCameras();
    navigator.mediaDevices.addEventListener('devicechange', fetchCameras);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fetchCameras);
  }, []);

  useEffect(() => {
    if (cameraReady) {
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
  }, [selectedDeviceId]);

  useEffect(() => {
    const bc = new SyncService(CHANNEL_NAME);
    setChannel(bc);
    const connectedRef = { current: false };

    bc.onMessage((data) => {
      const { type, payload } = data;
      if (type === 'PONG') {
        connectedRef.current = true;
        setCameraReady(true);
        setSyncRequest(prev => prev + 1);
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

    // Gửi PING lặp lại mỗi 1s cho tới khi nhận được PONG — tránh trường hợp
    // gói tin đầu tiên bị rơi do timing (Customer Screen mở sau/tải chậm).
    // Ngừng lại ngay khi kết nối thành công.
    bc.postMessage({ type: 'PING' });
    const retryInterval = setInterval(() => {
      if (!connectedRef.current) {
        bc.postMessage({ type: 'PING' });
      } else {
        clearInterval(retryInterval);
      }
    }, 1000);

    return () => { clearInterval(retryInterval); bc.close(); };
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
      
      const timeout = setTimeout(broadcastAssets, 50); // Small debounce for rapid slot dragging
      return () => clearTimeout(timeout);
    }
  }, [customConfig, capturedImages, channel, syncRequest]);

  // Gửi lựa chọn camera sang Customer Screen — Customer mới là nơi sở hữu
  // camera thật, nên chỉ cần gửi đúng deviceId, không cần gửi lại các state
  // (isSessionActive/countdown/...) vì các state đó giờ do Customer làm chủ.
  useEffect(() => {
    if (channel && cameraReady) {
      try {
        channel.postMessage({ type: 'SELECT_DEVICE', payload: { deviceId: selectedDeviceId } });
      } catch (err) {
        console.error("Broadcast device select error:", err);
      }
    }
  }, [selectedDeviceId, channel, cameraReady, syncRequest]);

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
    let count = 3;
    setCountdown(count);
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(timer);
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
        canvas.width = 1280; canvas.height = 720;
        if (video && video.srcObject && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
          setTimeout(() => {
            setIsProcessing(false);
            setIsSessionActive(false);
          }, 1500);
        }
      }
    }
  };

  const startSession = () => {
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
  const [printCopies, setPrintCopies] = useState(1);

  // Tự động mở cửa sổ in ảnh khi đã có ảnh hoàn chỉnh
  useEffect(() => {
    if (capturedImages.length === customConfig.totalShots && !isSessionActive && !isProcessing && finalImage) {
      setIsPrintModalOpen(true);
      setPrintCopies(1); // Reset số lượng in về 1
    }
  }, [capturedImages.length, customConfig.totalShots, isSessionActive, isProcessing, finalImage]);

  const handlePrint = async () => {
    if (!selectedPrinter) {
      alert("Vui long chon may in o cot ben trai!");
      return;
    }
    console.log("Dang in...");
    setIsPrintModalOpen(false);
    if ((window as any).electronAPI && (window as any).electronAPI.printImage) {
      const result = await (window as any).electronAPI.printImage({ imageBase64: finalImage, copies: printCopies, printerName: selectedPrinter });
      if (!result.success) alert("Loi khi in: " + result.error);
    }
  };

  const [saveDirectory, setSaveDirectory] = useState<string>('');
  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');

  useEffect(() => {
    if ((window as any).electronAPI) {
      if ((window as any).electronAPI.getSaveDirectory) {
        (window as any).electronAPI.getSaveDirectory().then((dir: string) => setSaveDirectory(dir));
      }
      if ((window as any).electronAPI.getPrinters) {
        (window as any).electronAPI.getPrinters().then((p: any[]) => setPrinters(p));
      }
      if ((window as any).electronAPI.getSavedPrinter) {
        (window as any).electronAPI.getSavedPrinter().then((p: string) => {
          if (p) setSelectedPrinter(p);
        });
      }
    }
  }, []);

  const handlePrinterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedPrinter(name);
    if ((window as any).electronAPI && (window as any).electronAPI.savePrinter) {
      (window as any).electronAPI.savePrinter(name);
    }
  };

  const handleChangeSaveDirectory = async () => {
    if ((window as any).electronAPI && (window as any).electronAPI.selectDirectory) {
      const newDir = await (window as any).electronAPI.selectDirectory();
      if (newDir) setSaveDirectory(newDir);
    }
  };

  const resetSession = () => {
    if (cameraReady && channel) {
      channel.postMessage({ type: 'RESET_SESSION' });
    }
    setCapturedImages([]);
    setCurrentShotIndex(0);
    setIsSessionActive(false);
    setIsProcessing(false);
  };

  return (
    <div className="flex-1 w-full p-6 max-w-[1400px] mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Màn hình điều khiển</h1>
          <p className="text-xs opacity-50 uppercase tracking-widest text-amber-glow">Screen 1</p>
        </div>
        <div className="flex items-center gap-4">
          {!cameraReady && (
            <button 
              onClick={() => {
                if (window.electronAPI) {
                  window.electronAPI.openCustomerScreen();
                } else {
                  window.open('?mode=camera', '_blank');
                }
              }}
              className="text-xs font-bold uppercase tracking-widest bg-amber-glow/20 text-amber-glow border border-amber-glow/50 px-4 py-2 rounded-lg hover:bg-amber-glow/30 transition-all flex items-center gap-2"
            >
              <ExternalLink className="w-3 h-3" />
              Mở màn hình 2
            </button>
          )}
          <div className="status-item text-[11px] flex items-center gap-2 text-white/60 bg-white/5 px-3 py-2 rounded-lg border border-white/10">
            <div className={`dot ${cameraReady ? 'pulse bg-[#4ade80]' : 'bg-neutral-500'}`}></div> 
            {cameraReady ? 'CUSTOMER SCREEN SYNCED' : 'CUSTOMER SCREEN DISCONNECTED'}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 pb-8 min-h-[850px]">
        {/* Left Column: Config Builder & Strip Preview */}
        <div className="flex-[1.2] flex flex-col gap-4">
           
           <div className="card bg-black/50 border border-white/10 rounded-xl p-5 shrink-0 flex flex-row justify-between items-center">
              <div className="flex flex-col overflow-hidden mr-4">
                <h2 className="card-title text-amber-glow">Nơi lưu ảnh & Video</h2>
                <p className="text-[10px] font-mono text-white/50 mt-1 truncate" title={saveDirectory}>{saveDirectory || 'Mặc định (Pictures/CGBOOTH)'}</p>
              </div>
              <button 
                onClick={handleChangeSaveDirectory} 
                className="bg-white/10 shrink-0 text-white font-bold text-[10px] uppercase px-3 py-2 rounded-lg hover:bg-white/20 transition-colors"
              >
                Đổi thư mục
              </button>
           </div>

           <div className="card bg-black/50 border border-white/10 rounded-xl p-5 shrink-0 flex flex-row justify-between items-center">
              <div className="flex flex-col">
                <h2 className="card-title text-amber-glow">Cài đặt Frame</h2>
                <p className="text-xs text-white/50 mt-1">{customConfig.name} ({customConfig.totalShots} ảnh)</p>
              </div>
              <button 
                onClick={() => setIsEditorOpen(true)} 
                className="bg-amber-glow text-black font-bold text-xs uppercase px-4 py-2 rounded-lg hover:bg-amber-glow/80 transition-colors shadow-[0_0_15px_rgba(255,191,0,0.2)]"
              >
                Cấu hình frame
              </button>
           </div>

           <div className="card bg-black/50 border border-white/10 rounded-xl p-5 shrink-0 flex flex-col gap-2">
              <h2 className="card-title text-amber-glow">May in ngam (Silent Print)</h2>
              <select 
                value={selectedPrinter} 
                onChange={handlePrinterChange}
                className="bg-white/10 text-white text-xs px-3 py-2 rounded-lg border border-white/20 focus:outline-none focus:border-amber-glow"
              >
                <option value="">-- Chon may in --</option>
                {printers.map((p, i) => (
                  <option key={i} value={p.name}>{p.name}</option>
                ))}
              </select>
           </div>

           {/* Saved Frames List */}
           <div className="card bg-black/50 border border-white/10 rounded-xl p-5 shrink-0 max-h-48 overflow-y-auto custom-scrollbar">
              <h2 className="card-title text-amber-glow mb-3"> Frame ({savedFrames.length})</h2>
              <div className="flex flex-col gap-2">
                {savedFrames.map(frame => (
                   <div key={frame.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${customConfig.id === frame.id ? 'bg-amber-glow/20 border-amber-glow text-amber-glow' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                     <button 
                       onClick={() => setCustomConfig(frame)}
                       disabled={isSessionActive}
                       className="flex-1 flex items-center justify-between text-left focus:outline-none"
                     >
                       <span>{frame.name}</span>
                       <span className="text-[10px] opacity-60">{frame.totalShots} ảnh</span>
                     </button>
                     {savedFrames.length > 1 && (
                       <button onClick={(e) => deleteFrame(frame.id, e)} className="p-1 hover:text-red-400 text-white/40 transition-colors" title="Xóa Frame">
                         <Trash2 className="w-4 h-4" />
                       </button>
                     )}
                   </div>
                ))}
              </div>
           </div>

           <div className="card bg-black/50 border border-white/10 rounded-xl p-5 flex flex-col flex-1 min-h-[400px] relative">
             <h2 className="card-title text-amber-glow mb-4 text-center shrink-0">Xem trước</h2>
             <div className="flex-1 overflow-hidden flex flex-col items-center p-4 bg-white/5 rounded-lg border border-white/5 relative">
                <div className="absolute inset-0 p-4">
                  <ScalablePreview config={customConfig} capturedImages={capturedImages} />
                </div>
             </div>
           </div>
        </div>

        {/* Right Column: Process & Camera */}
        <div className="flex-[2] flex flex-col gap-4">
           <div className="card bg-black border border-white/10 rounded-xl overflow-hidden relative shadow-xl flex-1 min-h-[300px]">
             <div className="absolute top-0 right-0 bg-amber-glow text-black text-[10px] font-bold px-4 py-1.5 flex items-center gap-3 z-50">
               <button 
                 onClick={fetchCameras} 
                 className="hover:bg-black/20 p-1 rounded transition-colors"
                 title="Làm mới danh sách Camera"
               >
                 <RefreshCw className="w-3 h-3" />
               </button>
               <select 
                 className="bg-black/50 text-white rounded outline-none border border-black/30 font-mono text-[9px] max-w-[150px] overflow-hidden text-ellipsis"
                 value={selectedDeviceId}
                 onChange={e => setSelectedDeviceId(e.target.value)}
               >
                 <option value="">Default Camera</option>
                 {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
               </select>
               <span className="uppercase tracking-widest">LIVE CAMERA</span>
             </div>
             
             {cameraReady ? (
               /* Screen 2 kết nối → hiện live frame từ Screen 2 */
               liveFrame ? (
                 <img src={liveFrame} className="w-full h-full object-cover opacity-70" alt="Live View" />
               ) : (
                 <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-white/30 text-xs uppercase tracking-widest font-mono">
                   [Waiting for Customer Camera...]
                 </div>
               )
             ) : (
               /* Standalone → hiện trực tiếp camera của máy */
               <>
                 <video
                   ref={videoRef}
                   autoPlay playsInline muted
                   className="w-full h-full object-cover"
                 />
                 <canvas ref={canvasRef} className="hidden" />
                 {!previewStream && (
                   <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-white/30 text-xs uppercase tracking-widest font-mono animate-pulse">
                     [Initializing Camera...]
                   </div>
                 )}
               </>
             )}

             <AnimatePresence>
               {countdown !== null && (
                 <motion.div key={countdown} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.2, opacity: 0 }} className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                   <div className="text-6xl md:text-8xl font-bold text-white drop-shadow-[0_0_20px_rgba(255,191,0,0.8)]">{countdown}</div>
                 </motion.div>
               )}
             </AnimatePresence>
           </div>

           <div className="flex gap-4 shrink-0">
             <div className="card bg-black/50 border border-white/10 rounded-xl p-5 flex-1 flex flex-col h-40">
                {capturedImages.length === customConfig.totalShots && !isProcessing ? (
                  <div className="flex items-center gap-4 h-full">
                    <div className="bg-white p-2 rounded-lg shrink-0">
                      <QRCodeSVG value={sessionDlUrl || "https://cgbooth.com/"} size={80} />
                    </div>
                    <div className="flex flex-col justify-center">
                      <h2 className="text-amber-glow font-bold mb-1 uppercase tracking-widest text-sm">Session Complete</h2>
                      <p className="text-neutral-400 text-xs mb-1">Mã QR khách hàng đã sẵn sàng.</p>
                      {finalImage && (window as any).electronAPI ? (
                        <p className="text-[#4ade80] text-xs font-bold">✅ Đã lưu ảnh vào ổ cứng</p>
                      ) : (
                        <a href={finalImage || '#'} download="neobooth-strip.png" className="text-white text-xs underline underline-offset-2">Tải về thủ công</a>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="card-title text-amber-glow mb-2">Process Log</h2>
                    <div className="flex-1 overflow-y-auto pr-2 text-sm custom-scrollbar">
                        <div className="log-entry">[SYSTEM] Master Control Initialized</div>
                        {cameraReady ? <div className="log-entry log-success">[SYNC] Customer Screen Connected</div> : <div className="log-entry text-neutral-400">[SYNC] Customer Screen not detected. Standalone mode.</div>}
                        {countdown !== null && <div className="log-entry">[PROCESS] Triggering Shot {currentShotIndex + 1}/{customConfig.totalShots}...</div>}
                        {isProcessing && <div className="log-entry log-success">[PROCESS] Rendering Final Strip...</div>}
                    </div>
                  </>
                )}
             </div>
            
             <div className="flex-1 flex flex-col justify-end">
                {(capturedImages.length === 0 || isSessionActive) && (
                   <button
                    onClick={startSession}
                    disabled={isSessionActive}
                    className={`btn-capture w-full flex items-center justify-center gap-3 text-base py-6 transition-all h-full shadow-[0_0_30px_rgba(255,191,0,0.15)]`}
                   >
                    <Camera className="w-6 h-6" />
                    BẮT ĐẦU CHỤP ({customConfig.totalShots} ẢNH)
                   </button>
                )}
                {capturedImages.length === customConfig.totalShots && !isSessionActive && !isProcessing && (
                   <button
                    onClick={resetSession}
                    className="btn-capture w-full flex items-center justify-center gap-3 !bg-white !text-black shadow-[0_0_30px_rgba(255,255,255,0.2)] text-base py-6 h-full"
                   >
                    <RefreshCw className="w-6 h-6" />
                    PHIÊN MỚI (RESET)
                   </button>
                )}
             </div>
           </div>
        </div>

      </div>

      {/* Editor Modal Overlay */}
      <AnimatePresence>
        {isEditorOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col gap-6 shadow-2xl">
              <div className="flex justify-between items-center border-b border-white/10 pb-4 shrink-0">
                <h2 className="text-xl font-bold text-amber-glow uppercase tracking-widest">Visual Frame Editor</h2>
                <div className="flex items-center gap-3">
                   <input type="text" value={customConfig.name} onChange={e => setCustomConfig(prev => ({...prev, name: e.target.value}))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-glow w-48" placeholder="Tên Frame..." />
                   <button onClick={saveCurrentFrame} className="bg-amber-glow text-black font-bold text-xs uppercase px-4 py-2 rounded-lg hover:bg-amber-glow/80 transition-colors">Lưu</button>
                   <button onClick={createNewFrame} className="bg-white/10 text-white font-bold text-xs uppercase px-4 py-2 rounded-lg hover:bg-white/20 transition-colors">Mới</button>
                   <div className="w-px h-6 bg-white/20 mx-2"></div>
                   <button onClick={() => setIsEditorOpen(false)} className="text-white/50 hover:text-white transition-colors bg-white/5 p-2 rounded-lg hover:bg-white/10">
                      <X className="w-5 h-5" />
                   </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[400px]">
                 <VisualFrameEditor config={customConfig} setConfig={setCustomConfig} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print Modal Overlay */}
      <AnimatePresence>
        {isPrintModalOpen && finalImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-neutral-900 border border-white/10 p-8 rounded-2xl w-full max-w-md flex flex-col gap-6 shadow-2xl items-center">
              <h2 className="text-2xl font-bold text-amber-glow uppercase tracking-widest text-center">IN ẢNH</h2>
              
              <div className="w-full bg-white/5 rounded-xl p-4 flex justify-center">
                <img src={finalImage} alt="Preview" className="max-h-[30vh] object-contain rounded drop-shadow-lg" />
              </div>

              <div className="flex flex-col gap-2 w-full text-center mt-2">
                <p className="text-sm text-white/70 uppercase tracking-widest">SỐ LƯỢNG BẢN IN</p>
                <div className="flex items-center justify-center gap-6 mt-2">
                  <button onClick={() => setPrintCopies(Math.max(1, printCopies - 1))} className="bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-colors">-</button>
                  <span className="text-5xl font-bold text-white w-16 text-center">{printCopies}</span>
                  <button onClick={() => setPrintCopies(printCopies + 1)} className="bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-colors">+</button>
                </div>
              </div>

              <div className="flex gap-4 w-full mt-4">
                <button 
                  onClick={() => setIsPrintModalOpen(false)} 
                  className="flex-1 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 py-4 rounded-xl font-bold tracking-widest transition-colors uppercase"
                >
                  Bỏ qua
                </button>
                <button 
                  onClick={handlePrint} 
                  className="flex-[2] bg-amber-glow text-black hover:bg-amber-glow/80 py-4 rounded-xl font-bold tracking-widest transition-colors shadow-[0_0_20px_rgba(255,191,0,0.3)] uppercase text-lg"
                >
                  XÁC NHẬN IN
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -------------------------------------------------------------
// CAMERA SCREEN (Customer)
// -------------------------------------------------------------
function CameraScreen() {
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
  const [sessionDlUrl, setSessionDlUrl] = useState<string>('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

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
    let count = 5;
    setCountdown(count);
    broadcastState({ countdown: count, currentShotIndex: shotIndex, isSessionActive: true });
    
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        broadcastState({ countdown: count });
      } else {
        clearInterval(timer);
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
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
          
          // Không cần chờ 3 giây ảo nữa, cập nhật state luôn để bắt đầu render frame
          setIsProcessing(false);
          setIsSessionActive(false);
          broadcastState({ isProcessing: false, isSessionActive: false });
        }
      }
    }
  };

  const beginSession = () => {
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
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
               ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
      setSessionDlUrl('Đang tạo ảnh ghép...');
      generateFinalImage(customConfig, capturedImages).then(async data => {
        setFinalImage(data);
      });
    } else {
      setFinalImage(null);
      setSessionDlUrl('');
    }
  }, [capturedImages, customConfig]);

  useEffect(() => {
    const processAll = async () => {
      if (!finalImage || !recordedVideoBlob || capturedImages.length !== customConfig.totalShots) return;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const currentSessionName = `Session_${timestamp}`;
      
      const videoBase64 = await blobToBase64(recordedVideoBlob);
      if ((window as any).electronAPI) {
        (window as any).electronAPI.saveSession({
          sessionName: currentSessionName,
          finalImage: finalImage,
          rawImages: capturedImages,
          videoBase64: videoBase64
        });
        
        if ((window as any).electronAPI.getTunnelUrl) {
           const tunnelUrl = await (window as any).electronAPI.getTunnelUrl();
           if (tunnelUrl) {
              setSessionDlUrl(`${tunnelUrl}?id=${currentSessionName}`);
           } else {
              setSessionDlUrl("Đang tạo link, vui lòng thử lại...");
           }
        }
      } else {
        setSessionDlUrl("");
      }
    };
    processAll();
  }, [finalImage, recordedVideoBlob, capturedImages, customConfig.totalShots]);

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
        if (payload.deviceId !== selectedDeviceId) {
           setSelectedDeviceId(payload.deviceId);
        }
      } else if (type === 'START_SESSION') {
        beginSession();
      } else if (type === 'RESET_SESSION') {
        resetLocalSession();
      }
    });

    return () => bc.close();
  }, []);

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    async function setupCamera() {
      try {
        const constraints = selectedDeviceId 
            ? { video: { deviceId: { exact: selectedDeviceId }, width: 1280, height: 720 } }
            : { video: { width: 1280, height: 720, facingMode: "user" } };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = mediaStream;
        setStream(mediaStream);
        setCameraError(null);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (err) {
        setCameraError("UI SIMULATION MODE ACTIVE (NO CAMERA)");
      }
    }
    setupCamera();
    return () => { if (currentStream) currentStream.getTracks().forEach(t => t.stop()); };
  }, [selectedDeviceId]);

  return (
    <div className="flex-1 w-full h-full bg-black relative overflow-hidden flex flex-row p-6 gap-6 items-stretch">
      {/* Left side: Live Camera Preview */}
      <div className="flex-[3] relative rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(74,222,128,0.15)] bg-neutral-900 border border-white/10 flex flex-col justify-center items-center">
        <AnimatePresence>
          {flash && <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 bg-white z-50 pointer-events-none" />}
        </AnimatePresence>

        {capturedImages.length < customConfig.totalShots ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={liveCanvasRef} className="hidden" />
            
            <AnimatePresence>
              {countdown !== null && (
                <motion.div key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }} className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  <div className="countdown-box drop-shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                    <div className="text-xl uppercase tracking-widest mb-2 text-white/80">Shot {currentShotIndex + 1}/{customConfig.totalShots}</div>
                    <div className="countdown-value text-8xl">{countdown}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8 z-40 bg-neutral-900">
             {isProcessing ? (
                <div className="flex flex-col items-center justify-center gap-6">
                  <RefreshCw className="w-16 h-16 animate-spin text-[#4ade80]" />
                  <p className="font-mono text-xl tracking-widest text-[#4ade80] uppercase">Processing Strip...</p>
                </div>
             ) : (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 z-40 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md overflow-y-auto p-4 custom-scrollbar">
                   <div className="bg-white p-8 md:p-12 rounded-[2rem] flex flex-row items-center justify-center gap-12 shadow-2xl my-auto w-full max-w-5xl">
                      
                      {/* Cột trái: QR Code */}
                      <div className="flex flex-col items-center text-center shrink-0">
                        <div className="p-4 bg-white border-4 border-neutral-200 rounded-xl mb-4 shadow-sm w-[240px] h-[240px] flex items-center justify-center">
                           {sessionDlUrl && sessionDlUrl.startsWith('http') ? (
                             <QRCodeSVG value={sessionDlUrl} size={200} />
                           ) : (
                             <div className="flex flex-col items-center justify-center text-neutral-400">
                               <RefreshCw className="w-8 h-8 animate-spin mb-3 text-green-400" />
                               <p className="text-xs font-bold text-center px-4">{sessionDlUrl || "Đang xử lý..."}</p>
                             </div>
                           )}
                        </div>
                        <h3 className="text-2xl font-black text-black tracking-tight mb-2">QUÉT MÃ ĐỂ TẢI</h3>
                        <p className="text-neutral-500 font-medium text-sm">Tải Ảnh Ghép, Ảnh Gốc & Video Hậu Trường</p>
                        <p className="text-neutral-400 font-medium text-xs italic mt-1">(Hỗ trợ tải bằng mạng 4G)</p>
                      </div>

                      {/* Cột phải: Frame ảnh hoàn chỉnh, phóng to */}
                      {finalImage && (
                        <div className="flex justify-center shrink-0 h-[65vh]">
                          <img src={finalImage} className="h-full object-contain drop-shadow-2xl rounded-xl border border-neutral-200" alt="Final Strip" />
                        </div>
                      )}

                   </div>
                </motion.div>
             )}
          </div>
        )}

        {!stream && capturedImages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-8 text-center z-10">
            {cameraError ? (
              <p className="text-amber-glow uppercase tracking-widest text-lg font-mono border border-amber-glow/30 p-6 rounded bg-amber-glow/10">
                {cameraError}
              </p>
            ) : (
              <p className="text-white/40 uppercase tracking-widest text-lg font-mono animate-pulse">Initializing Hardware...</p>
            )}
          </div>
        )}
      </div>

      {/* Right side: Final Frame/Strip Layout Preview */}
      <div className="w-[380px] h-full flex flex-col py-6 bg-[#f8f8f8] rounded-2xl shadow-2xl relative shrink-0 border-[6px] border-neutral-800 items-center">
         <div className="flex-1 w-full p-2 flex flex-col items-center overflow-hidden">
           <ScalablePreview config={customConfig} capturedImages={capturedImages} />
         </div>
      </div>
    </div>
  );
}
