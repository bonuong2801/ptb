import React, { useState, useRef, useEffect } from 'react';
import { Upload, RotateCw } from 'lucide-react';
import { CustomFrameConfig, PhotoShape } from '../types/booth';

// Shared Strip Preview Component
export function StripPreview({ config, capturedImages, className = "" }: { config: CustomFrameConfig, capturedImages: string[], className?: string }) {
  const isSquareFrame = config.frameShape === 'square';
  const aspectClass = isSquareFrame ? 'aspect-square' : 'aspect-[1/3]';
  const currentLayouts = config.photoLayouts || Array.from({length: config.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15, rotation: 0 }));

  return (
    <div className={`relative bg-transparent overflow-hidden shrink-0 w-full ${aspectClass} ${className}`}>
      <div className="absolute inset-0 z-10 w-full h-full">
        {currentLayouts.map((layout, idx) => {
           if (idx >= config.totalShots) return null;
           const captured = capturedImages[idx];
           const shape = config.photoShapes[idx] || 'rectangle';
           const rotation = layout.rotation || 0;
           return (
              <div 
                key={idx} 
                className={`absolute overflow-hidden flex items-center justify-center ${shape === 'circle' ? 'rounded-full' : ''} bg-transparent`} 
                style={{ 
                  left: `${layout.x}%`, 
                  top: `${layout.y}%`, 
                  width: `${layout.width}%`, 
                  height: `${layout.height}%`,
                  transform: rotation ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: 'center center'
                }}
              >
                 {captured ? (
                    <img src={captured} className="w-full h-full object-cover animate-zoom-in" alt="Captured" />
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
export function ScalablePreview({ config, capturedImages }: { config: CustomFrameConfig, capturedImages: string[] }) {
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

export function VisualFrameEditor({ config, setConfig }: { config: CustomFrameConfig, setConfig: React.Dispatch<React.SetStateAction<CustomFrameConfig>> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);

  // Drag & Rotate State
  const dragRef = useRef<{
    idx: number,
    type: 'drag' | 'resize' | 'rotate',
    startX: number,
    startY: number,
    initX: number,
    initY: number,
    initW: number,
    initH: number,
    initRotation: number,
    centerX: number,
    centerY: number
  } | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const { idx, type, startX, startY, initX, initY, initW, initH, initRotation, centerX, centerY } = dragRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      
      const dx = ((e.clientX - startX) / rect.width) * 100;
      const dy = ((e.clientY - startY) / rect.height) * 100;

      setConfig(prev => {
         const newLayouts = [...(prev.photoLayouts || [])];
         const layout = newLayouts[idx] || { x: 10, y: 10, width: 80, height: 15, rotation: 0 };
         if (type === 'drag') {
            newLayouts[idx] = { ...layout, x: Math.max(0, Math.min(100 - layout.width, initX + dx)), y: Math.max(0, Math.min(100 - layout.height, initY + dy)) };
         } else if (type === 'resize') {
            newLayouts[idx] = { ...layout, width: Math.max(5, Math.min(100 - layout.x, initW + dx)), height: Math.max(5, Math.min(100 - layout.y, initH + dy)) };
         } else if (type === 'rotate') {
            const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            const startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);
            let delta = currentAngle - startAngle;
            let newRot = Math.round((initRotation + delta) * 2) / 2; // snap to 0.5 deg
            while (newRot > 180) newRot -= 360;
            while (newRot < -180) newRot += 360;
            newLayouts[idx] = { ...layout, rotation: newRot };
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

  const updateRotation = (idx: number, angle: number) => {
    let cleanAngle = Math.round(angle * 2) / 2;
    while (cleanAngle > 180) cleanAngle -= 360;
    while (cleanAngle < -180) cleanAngle += 360;
    setConfig(prev => {
      const newLayouts = [...(prev.photoLayouts || [])];
      const layout = newLayouts[idx] || { x: 10, y: 10, width: 80, height: 15, rotation: 0 };
      newLayouts[idx] = { ...layout, rotation: cleanAngle };
      return { ...prev, photoLayouts: newLayouts };
    });
  };

  // Zoom bằng Ctrl + scroll
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

  const addSlot = () => {
     setConfig(prev => {
        const currentLayouts = prev.photoLayouts || Array.from({length: prev.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15, rotation: 0 }));
        const newLayouts = [...currentLayouts, { x: 20, y: 20, width: 30, height: 20, rotation: 0 }];
        const newShapes = [...prev.photoShapes, 'rectangle' as PhotoShape];
        return { ...prev, totalShots: newLayouts.length, photoLayouts: newLayouts, photoShapes: newShapes, layoutMode: 'freeform' };
     });
  };

  const removeSlot = (idx: number) => {
     setConfig(prev => {
        const currentLayouts = prev.photoLayouts || Array.from({length: prev.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15, rotation: 0 }));
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

  const currentLayouts = config.photoLayouts || Array.from({length: config.totalShots}).map((_, i) => ({ x: 10, y: 10 + (i * 20), width: 80, height: 15, rotation: 0 }));
  const aspectClass = config.frameShape === 'square' ? 'aspect-square' : 'aspect-[1/3]';

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex justify-between items-center liquid-glass p-3.5 rounded-2xl border border-white/10">
         <div>
            <label className="text-xs text-white/50 uppercase tracking-widest block mb-1 font-mono">Khung ảnh (Frame PNG)</label>
            <div className="flex items-center gap-2">
               <label className="flex items-center gap-2 cursor-pointer liquid-glass-pill hover:border-cyan-400/40 px-3.5 py-1.5 rounded-full text-sm transition-all">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span className="text-white/90 text-xs font-medium">{config.frameImage ? 'Đổi Frame' : 'Tải Frame lên'}</span>
                  <input type="file" accept="image/png" onChange={handleFileUpload} className="hidden" />
               </label>
               {config.frameImage && (
                 <button onClick={() => setConfig(prev => ({...prev, frameImage: null}))} className="text-[10px] text-red-400 hover:bg-red-500/20 px-2.5 py-1 rounded-full transition-colors">Xoá Ảnh</button>
               )}
            </div>
         </div>
         <div className="flex flex-col items-end gap-2">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest block mb-1 font-mono">Tỉ Lệ Khung</label>
              <div className="flex liquid-glass-pill p-1 gap-1">
                 <button onClick={() => setConfig(prev => ({...prev, frameShape: 'rectangle'}))} className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all ${config.frameShape === 'rectangle' ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'text-white/50 hover:text-white'}`}>Chữ Nhật</button>
                 <button onClick={() => setConfig(prev => ({...prev, frameShape: 'square'}))} className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all ${config.frameShape === 'square' ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'text-white/50 hover:text-white'}`}>Vuông</button>
              </div>
            </div>
            
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest block mb-1 font-mono">Vị trí Khung</label>
              <div className="flex liquid-glass-pill p-1 gap-1">
                 <button onClick={() => setConfig(prev => ({...prev, frameLayering: 'above'}))} className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all ${(!config.frameLayering || config.frameLayering === 'above') ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'text-white/50 hover:text-white'}`}>Đè Lên Ảnh</button>
                 <button onClick={() => setConfig(prev => ({...prev, frameLayering: 'below'}))} className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all ${config.frameLayering === 'below' ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'text-white/50 hover:text-white'}`}>Nằm Dưới Ảnh</button>
              </div>
            </div>
         </div>
      </div>

      {/* Canvas khu vực — Ctrl+scroll để zoom */}
      <div
        ref={scrollWrapperRef}
        className="w-full bg-black/40 rounded-2xl border border-white/10 overflow-auto"
        style={{ maxHeight: '480px' }}
      >
        {/* Zoom indicator */}
        <div className="sticky top-0 left-0 z-50 flex items-center justify-between px-3.5 py-2 liquid-glass border-b border-white/10">
          <span className="text-[10px] text-white/50 uppercase tracking-widest font-mono">Ctrl + cuộn chuột để zoom</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-cyan-400 font-bold">{Math.round(zoomLevel * 100)}%</span>
            {zoomLevel !== 1 && (
              <button
                onClick={() => setZoomLevel(1)}
                className="text-[10px] text-white/60 hover:text-white px-2 py-0.5 rounded-full liquid-glass-pill transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="p-4 flex justify-center">
          <div
            ref={containerRef}
            className={`relative ${aspectClass} bg-white shadow-2xl rounded-sm select-none touch-none`}
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
                 const rotationAngle = layout.rotation || 0;
                 return (
                   <div
                     key={idx}
                     onPointerDown={(e) => {
                        e.stopPropagation();
                        setActiveSlotIdx(idx);
                        dragRef.current = {
                          idx,
                          type: 'drag',
                          startX: e.clientX,
                          startY: e.clientY,
                          initX: layout.x,
                          initY: layout.y,
                          initW: layout.width,
                          initH: layout.height,
                          initRotation: rotationAngle,
                          centerX: 0,
                          centerY: 0
                        };
                     }}
                     className={`absolute cursor-move border-[2px] transition-shadow ${isActive ? 'border-cyan-400 bg-cyan-400/20 shadow-[0_0_15px_rgba(6,182,212,0.4)] z-30' : 'border-black/30 bg-black/10 hover:border-cyan-400/50 z-10'} ${isCircle ? 'rounded-full' : 'rounded-none'}`}
                     style={{
                       left: `${layout.x}%`,
                       top: `${layout.y}%`,
                       width: `${layout.width}%`,
                       height: `${layout.height}%`,
                       transform: rotationAngle ? `rotate(${rotationAngle}deg)` : undefined,
                       transformOrigin: 'center center'
                     }}
                   >
                      <div className="absolute inset-0 flex items-center justify-center text-black/40 font-black text-xl pointer-events-none select-none">{idx + 1}</div>

                      {/* Hiển thị góc xoay nếu có lệch */}
                      {rotationAngle !== 0 && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-black/75 border border-cyan-400/50 text-cyan-300 font-mono text-[9px] font-bold shadow pointer-events-none whitespace-nowrap">
                          {rotationAngle > 0 ? `+${rotationAngle}°` : `${rotationAngle}°`}
                        </div>
                      )}
                      
                      {/* Active Controls */}
                      {isActive && (
                        <>
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/90 backdrop-blur-md rounded-full px-2 py-1 z-50 whitespace-nowrap border border-white/20 shadow-lg">
                             <button onClick={(e) => { e.stopPropagation(); toggleShape(idx); }} className="px-2 py-0.5 text-[10px] text-white hover:text-cyan-400 rounded-full transition-colors">
                               {isCircle ? 'Đổi Vuông' : 'Đổi Tròn'}
                             </button>
                             <button onClick={(e) => { e.stopPropagation(); removeSlot(idx); }} className="px-2 py-0.5 text-[10px] text-red-400 hover:text-red-300 rounded-full transition-colors">
                               Xóa
                             </button>
                          </div>

                          {/* Rotation Pin Handle (ở mép trên, kéo để xoay góc) */}
                          <div
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (!containerRef.current) return;
                              const rect = containerRef.current.getBoundingClientRect();
                              const slotCenterX = rect.left + ((layout.x + layout.width / 2) / 100) * rect.width;
                              const slotCenterY = rect.top + ((layout.y + layout.height / 2) / 100) * rect.height;
                              dragRef.current = {
                                idx,
                                type: 'rotate',
                                startX: e.clientX,
                                startY: e.clientY,
                                initX: layout.x,
                                initY: layout.y,
                                initW: layout.width,
                                initH: layout.height,
                                initRotation: rotationAngle,
                                centerX: slotCenterX,
                                centerY: slotCenterY
                              };
                            }}
                            className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 bg-gradient-to-tr from-cyan-400 to-indigo-500 border border-white rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-[0_0_10px_#22d3ee] z-40 hover:scale-110 transition-transform"
                            title="Kéo chuột vòng quanh để xoay ảnh"
                          >
                            <RotateCw className="w-2.5 h-2.5 text-white stroke-[2.5]" />
                          </div>

                          {/* Resize Handle */}
                          <div
                            onPointerDown={(e) => {
                               e.stopPropagation();
                               dragRef.current = {
                                 idx,
                                 type: 'resize',
                                 startX: e.clientX,
                                 startY: e.clientY,
                                 initX: layout.x,
                                 initY: layout.y,
                                 initW: layout.width,
                                 initH: layout.height,
                                 initRotation: rotationAngle,
                                 centerX: 0,
                                 centerY: 0
                               };
                            }}
                            className="absolute -right-2 -bottom-2 w-5 h-5 bg-cyan-400 border-2 border-black rounded-full cursor-nwse-resize shadow-[0_0_10px_#22d3ee]"
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

      {/* Thanh vi chỉnh góc xoay khi đang chọn một ô ảnh */}
      {activeSlotIdx !== null && currentLayouts[activeSlotIdx] && (
        <div className="w-full liquid-glass rounded-2xl p-3 border border-cyan-400/30 flex flex-col gap-2.5 shadow-[0_4px_24px_rgba(6,182,212,0.12)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white tracking-wide">
                Góc Xoay Ô #{activeSlotIdx + 1}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-black text-cyan-300 bg-cyan-950/60 px-2.5 py-0.5 rounded-lg border border-cyan-500/30">
                {(currentLayouts[activeSlotIdx].rotation || 0) > 0 ? `+${currentLayouts[activeSlotIdx].rotation || 0}°` : `${currentLayouts[activeSlotIdx].rotation || 0}°`}
              </span>
              <button
                onClick={() => updateRotation(activeSlotIdx, 0)}
                className="text-[10px] text-white/60 hover:text-white px-2 py-0.5 rounded-lg liquid-glass-pill transition-colors font-medium"
                title="Đặt góc về 0° thẳng hàng"
              >
                Reset 0°
              </button>
            </div>
          </div>

          {/* Steppers & Presets */}
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateRotation(activeSlotIdx, (currentLayouts[activeSlotIdx].rotation || 0) - 5)}
                className="px-2 py-1 text-[11px] font-mono text-white/80 hover:text-cyan-300 liquid-glass-pill rounded-lg transition-colors"
                title="Nghiêng trái 5 độ"
              >
                -5°
              </button>
              <button
                onClick={() => updateRotation(activeSlotIdx, (currentLayouts[activeSlotIdx].rotation || 0) - 1)}
                className="px-2 py-1 text-[11px] font-mono text-white/80 hover:text-cyan-300 liquid-glass-pill rounded-lg transition-colors"
                title="Nghiêng trái 1 độ"
              >
                -1°
              </button>
              <button
                onClick={() => updateRotation(activeSlotIdx, (currentLayouts[activeSlotIdx].rotation || 0) - 0.5)}
                className="px-1.5 py-1 text-[10px] font-mono text-white/80 hover:text-cyan-300 liquid-glass-pill rounded-lg transition-colors"
                title="Vi chỉnh trái 0.5 độ"
              >
                -0.5°
              </button>
            </div>

            {/* Range slider */}
            <div className="flex-1 min-w-[100px] px-2 flex items-center">
              <input
                type="range"
                min="-45"
                max="45"
                step="0.5"
                value={currentLayouts[activeSlotIdx].rotation || 0}
                onChange={(e) => updateRotation(activeSlotIdx, parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => updateRotation(activeSlotIdx, (currentLayouts[activeSlotIdx].rotation || 0) + 0.5)}
                className="px-1.5 py-1 text-[10px] font-mono text-white/80 hover:text-cyan-300 liquid-glass-pill rounded-lg transition-colors"
                title="Vi chỉnh phải 0.5 độ"
              >
                +0.5°
              </button>
              <button
                onClick={() => updateRotation(activeSlotIdx, (currentLayouts[activeSlotIdx].rotation || 0) + 1)}
                className="px-2 py-1 text-[11px] font-mono text-white/80 hover:text-cyan-300 liquid-glass-pill rounded-lg transition-colors"
                title="Nghiêng phải 1 độ"
              >
                +1°
              </button>
              <button
                onClick={() => updateRotation(activeSlotIdx, (currentLayouts[activeSlotIdx].rotation || 0) + 5)}
                className="px-2 py-1 text-[11px] font-mono text-white/80 hover:text-cyan-300 liquid-glass-pill rounded-lg transition-colors"
                title="Nghiêng phải 5 độ"
              >
                +5°
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={addSlot} className="w-full py-3 liquid-glass-interactive text-cyan-300 hover:text-white font-bold rounded-2xl text-sm border border-cyan-400/30 hover:border-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.15)] cursor-pointer">
         + Thêm Vùng Ghép Ảnh
      </button>
    </div>
  );
}

export default VisualFrameEditor;
