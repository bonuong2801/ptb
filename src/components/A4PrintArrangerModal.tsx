import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Printer, 
  Download, 
  RotateCw, 
  Plus, 
  Trash2, 
  Scissors, 
  X, 
  LayoutGrid, 
  Layers, 
  Sparkles,
  Maximize2
} from 'lucide-react';
import { A4StripItem, renderA4PrintCanvas } from '../utils/frameRenderer';

interface A4PrintArrangerModalProps {
  isOpen: boolean;
  onClose: () => void;
  finalImage: string;
  initialCopies: number;
  selectedPrinter?: string;
  onConfirmPrint: (a4Base64: string) => Promise<void>;
}

export const A4PrintArrangerModal: React.FC<A4PrintArrangerModalProps> = ({
  isOpen,
  onClose,
  finalImage,
  initialCopies,
  selectedPrinter,
  onConfirmPrint
}) => {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [showCutLines, setShowCutLines] = useState(true);
  const [activeStripId, setActiveStripId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    stripW: number;
    stripH: number;
    rectW: number;
    rectH: number;
  } | null>(null);

  // Kích thước thật của dải ảnh trên khổ A4 (tính bằng % toạ độ)
  // A4 Portrait: 210 x 297 mm. Dải 50 x 150 mm.
  // A4 Landscape: 297 x 210 mm.
  const getStripDimensions = (rot: 0 | 90, orient: 'portrait' | 'landscape') => {
    const isPortrait = orient === 'portrait';
    if (isPortrait) {
      if (rot === 0) {
        // Đứng: 50x150 mm
        return { w: (50 / 210) * 100, h: (150 / 297) * 100 }; // ~23.81% x 50.51%
      } else {
        // Ngang: 150x50 mm
        return { w: (150 / 210) * 100, h: (50 / 297) * 100 }; // ~71.43% x 16.84%
      }
    } else {
      // Landscape: 297 x 210 mm
      if (rot === 0) {
        // Đứng: 50x150 mm
        return { w: (50 / 297) * 100, h: (150 / 210) * 100 }; // ~16.84% x 71.43%
      } else {
        // Ngang: 150x50 mm
        return { w: (150 / 297) * 100, h: (50 / 210) * 100 }; // ~50.51% x 23.81%
      }
    }
  };

  // Khởi tạo danh sách dải ảnh theo số lượng bản in ban đầu
  const [strips, setStrips] = useState<A4StripItem[]>(() => {
    const count = Math.max(1, Math.min(6, initialCopies));
    if (count <= 2) {
      return [
        { id: 'strip-1', x: 23, y: 24.7, rotation: 0 },
        ...(count === 2 ? [{ id: 'strip-2', x: 53, y: 24.7, rotation: 0 as const }] : [])
      ];
    } else {
      // Nếu 4 bản hoặc nhiều hơn -> tự động xếp ngang tiết kiệm giấy
      return Array.from({ length: count }).map((_, i) => ({
        id: `strip-${i + 1}`,
        x: 14.3,
        y: 4 + i * 23,
        rotation: 90 as const
      }));
    }
  });

  // Tự động điều chỉnh khi initialCopies thay đổi
  useEffect(() => {
    const count = Math.max(1, Math.min(6, initialCopies));
    if (count === 2) {
      setOrientation('portrait');
      setStrips([
        { id: 'strip-1', x: 23, y: 24.7, rotation: 0 },
        { id: 'strip-2', x: 53, y: 24.7, rotation: 0 }
      ]);
    } else if (count >= 4) {
      setOrientation('portrait');
      setStrips(
        Array.from({ length: count }).map((_, i) => ({
          id: `strip-${i + 1}`,
          x: 14.3,
          y: 3 + i * 23,
          rotation: 90 as const
        }))
      );
    }
  }, [initialCopies]);

  // Xử lý sự kiện kéo thả (Drag & Drop) mượt mà với Pointer Events
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const { id, startX, startY, initX, initY, stripW, stripH, rectW, rectH } = dragRef.current;
      const dx = ((e.clientX - startX) / rectW) * 100;
      const dy = ((e.clientY - startY) / rectH) * 100;

      const nextX = Math.round(Math.max(0, Math.min(100 - stripW, initX + dx)) * 10) / 10;
      const nextY = Math.round(Math.max(0, Math.min(100 - stripH, initY + dy)) * 10) / 10;

      setStrips(prev => prev.map(s => s.id === id ? { ...s, x: nextX, y: nextY } : s));
    };

    const handlePointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  // Các preset dàn trang thông minh
  const applyPreset = (preset: '2-strip-portrait' | '4-strip-horizontal' | '4-strip-landscape' | '5-strip-max') => {
    if (preset === '2-strip-portrait') {
      setOrientation('portrait');
      setStrips([
        { id: 'strip-1', x: 23, y: 24.7, rotation: 0 },
        { id: 'strip-2', x: 53, y: 24.7, rotation: 0 }
      ]);
    } else if (preset === '4-strip-horizontal') {
      setOrientation('portrait');
      setStrips([
        { id: 'strip-1', x: 14.3, y: 4, rotation: 90 },
        { id: 'strip-2', x: 14.3, y: 27.5, rotation: 90 },
        { id: 'strip-3', x: 14.3, y: 51, rotation: 90 },
        { id: 'strip-4', x: 14.3, y: 74.5, rotation: 90 }
      ]);
    } else if (preset === '4-strip-landscape') {
      setOrientation('landscape');
      setStrips([
        { id: 'strip-1', x: 6.5, y: 14.3, rotation: 0 },
        { id: 'strip-2', x: 29.5, y: 14.3, rotation: 0 },
        { id: 'strip-3', x: 52.5, y: 14.3, rotation: 0 },
        { id: 'strip-4', x: 75.5, y: 14.3, rotation: 0 }
      ]);
    } else if (preset === '5-strip-max') {
      setOrientation('portrait');
      setStrips([
        { id: 'strip-1', x: 14.3, y: 2, rotation: 90 },
        { id: 'strip-2', x: 14.3, y: 21.5, rotation: 90 },
        { id: 'strip-3', x: 14.3, y: 41, rotation: 90 },
        { id: 'strip-4', x: 14.3, y: 60.5, rotation: 90 },
        { id: 'strip-5', x: 14.3, y: 80, rotation: 90 }
      ]);
    }
  };

  const toggleRotateStrip = (id: string) => {
    setStrips(prev => prev.map(s => {
      if (s.id !== id) return s;
      const newRot = (s.rotation === 0 ? 90 : 0) as 0 | 90;
      const dims = getStripDimensions(newRot, orientation);
      // Giữ strip không bị tràn lề
      const clampedX = Math.min(s.x, 100 - dims.w);
      const clampedY = Math.min(s.y, 100 - dims.h);
      return { ...s, rotation: newRot, x: Math.max(0, clampedX), y: Math.max(0, clampedY) };
    }));
  };

  const addStrip = () => {
    if (strips.length >= 8) return;
    const newId = `strip-${Date.now()}`;
    const dims = getStripDimensions(0, orientation);
    // Vị trí mặc định lùi một chút so với dải cuối
    const last = strips[strips.length - 1];
    const newX = last ? Math.min(100 - dims.w, last.x + 5) : 25;
    const newY = last ? Math.min(100 - dims.h, last.y + 5) : 25;
    setStrips(prev => [...prev, { id: newId, x: newX, y: newY, rotation: 0 }]);
    setActiveStripId(newId);
  };

  const removeStrip = (id: string) => {
    if (strips.length <= 1) return;
    setStrips(prev => prev.filter(s => s.id !== id));
    if (activeStripId === id) setActiveStripId(null);
  };

  // Tải file ảnh A4 300 DPI
  const handleDownloadA4 = async () => {
    setIsGenerating(true);
    try {
      const a4DataUrl = await renderA4PrintCanvas(finalImage, strips, orientation, showCutLines);
      if (!a4DataUrl) throw new Error("Không thể tạo ảnh A4");
      const a = document.createElement('a');
      const timeStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = a4DataUrl;
      a.download = `A4_Print_${timeStr}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Lỗi khi tải file A4: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Xác nhận và gửi lệnh in
  const handleConfirmPrint = async () => {
    setIsPrinting(true);
    try {
      const a4DataUrl = await renderA4PrintCanvas(finalImage, strips, orientation, showCutLines);
      if (!a4DataUrl) throw new Error("Không thể tạo dữ liệu in A4");
      await onConfirmPrint(a4DataUrl);
      onClose();
    } catch (err: any) {
      alert("Lỗi khi in ảnh A4: " + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  const isPortrait = orientation === 'portrait';
  const paperAspectClass = isPortrait ? 'aspect-[210/297]' : 'aspect-[297/210]';

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/85 backdrop-blur-lg p-3 sm:p-6 animate-zoom-in">
      <div className="liquid-glass border border-white/20 rounded-3xl w-full max-w-6xl h-[94vh] flex flex-col shadow-[0_30px_90px_rgba(0,0,0,0.85)] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Scissors className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
                DÀN TRANG & SẮP XẾP IN TRÊN GIẤY A4
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono font-normal">
                  True Scale 300 DPI
                </span>
              </h2>
              <p className="text-xs text-white/60">
                Kéo thả các dải ảnh đến vị trí mong muốn trên tờ giấy A4 trước khi in ra máy in thông thường
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadA4}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl liquid-glass-pill hover:border-cyan-400/40 text-cyan-300 hover:text-white transition-all text-xs font-bold cursor-pointer"
              title="Tải ảnh A4 nét cao để lưu hoặc gửi in tiệm"
            >
              <Download className="w-4 h-4" />
              <span>{isGenerating ? 'Đang tạo...' : 'Tải File A4 300DPI'}</span>
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Cột Trái: Canvas Tờ Giấy A4 Trực Quan */}
          <div className="flex-1 bg-black/40 p-4 sm:p-6 flex items-center justify-center overflow-auto relative">
            
            {/* Thước tỷ lệ trang A4 */}
            <div className="absolute top-3 left-6 text-[11px] font-mono text-white/40 flex items-center gap-2 select-none">
              <span>Khổ giấy:</span>
              <strong className="text-cyan-300 font-bold">
                A4 {isPortrait ? 'Đứng (210 × 297 mm)' : 'Ngang (297 × 210 mm)'}
              </strong>
              <span>• Kích thước 1 dải:</span>
              <strong className="text-white/80 font-bold">50 × 150 mm</strong>
            </div>

            {/* Khung mô phỏng tờ giấy A4 thật */}
            <div 
              ref={containerRef}
              className={`relative bg-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-md border-2 border-white/80 select-none overflow-hidden transition-all duration-300 ${paperAspectClass}`}
              style={{
                maxHeight: '100%',
                maxWidth: '100%',
                height: isPortrait ? '92%' : '82%'
              }}
            >
              {/* Vạch lưới mờ hướng dẫn canh lề (Subtle Grid) */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                  backgroundSize: '20px 20px'
                }}
              />

              {/* Các dải ảnh đã ghép được đặt trên giấy A4 */}
              {strips.map((strip, idx) => {
                const dims = getStripDimensions(strip.rotation, orientation);
                const isSelected = activeStripId === strip.id;
                const isRotated = strip.rotation === 90;

                return (
                  <div
                    key={strip.id}
                    onPointerDown={(e) => {
                      if (!containerRef.current) return;
                      setActiveStripId(strip.id);
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
                      const rect = containerRef.current.getBoundingClientRect();
                      dragRef.current = {
                        id: strip.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        initX: strip.x,
                        initY: strip.y,
                        stripW: dims.w,
                        stripH: dims.h,
                        rectW: rect.width || 1,
                        rectH: rect.height || 1,
                      };
                    }}
                    style={{
                      left: `${strip.x}%`,
                      top: `${strip.y}%`,
                      width: `${dims.w}%`,
                      height: `${dims.h}%`,
                      touchAction: 'none'
                    }}
                    className={`absolute cursor-grab active:cursor-grabbing transition-shadow group ${
                      isSelected 
                        ? 'ring-2 ring-cyan-500 shadow-[0_10px_25px_rgba(6,182,212,0.4)] z-30' 
                        : 'hover:ring-1 hover:ring-cyan-400/60 z-20 shadow-md'
                    }`}
                  >
                    {/* Ảnh dải thật */}
                    <div className="w-full h-full relative overflow-hidden bg-white">
                      <img 
                        src={finalImage} 
                        alt={`Strip ${idx + 1}`}
                        style={{
                          transform: isRotated ? 'rotate(90deg)' : undefined,
                          transformOrigin: 'center center'
                        }}
                        className={`w-full h-full ${isRotated ? 'object-cover' : 'object-fill'} pointer-events-none select-none`}
                      />

                      {/* Đường nét đứt hướng dẫn cắt kéo */}
                      {showCutLines && (
                        <div className="absolute inset-0 border border-dashed border-gray-400 pointer-events-none z-10 flex items-start justify-center">
                          <span className="text-[9px] text-gray-500 font-bold bg-white/80 px-1 rounded -translate-y-1/2">
                            ✂
                          </span>
                        </div>
                      )}

                      {/* Huy hiệu số thứ tự dải */}
                      <div className="absolute top-1 left-1 bg-black/75 text-cyan-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow pointer-events-none z-20">
                        #{idx + 1}
                      </div>

                      {/* Nút thao tác nhanh trên dải khi hover hoặc đang chọn */}
                      <div className="absolute bottom-1 right-1 flex items-center gap-1 z-30 opacity-90 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRotateStrip(strip.id);
                          }}
                          className="w-6 h-6 rounded-md bg-black/80 hover:bg-cyan-600 text-white flex items-center justify-center transition-colors shadow-md cursor-pointer"
                          title="Xoay 90° (Dọc ⇄ Ngang)"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                        {strips.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeStrip(strip.id);
                            }}
                            className="w-6 h-6 rounded-md bg-black/80 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-md cursor-pointer"
                            title="Xóa dải này"
                          >
                            <Trash2 className="w-3 h-3 text-red-300 hover:text-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cột Phải: Bảng điều khiển & Bố cục mẫu */}
          <div className="w-full lg:w-96 bg-black/60 border-t lg:border-t-0 lg:border-l border-white/10 p-5 flex flex-col justify-between overflow-y-auto custom-scrollbar">
            
            <div className="flex flex-col gap-5">
              
              {/* Bố cục mẫu nhanh (1-Click Presets) */}
              <div>
                <label className="text-xs text-white/50 uppercase tracking-widest font-mono flex items-center gap-1.5 mb-2.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                  Bố cục mẫu nhanh (1 Click)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => applyPreset('2-strip-portrait')}
                    className="p-2.5 rounded-xl text-left liquid-glass-interactive border border-white/10 hover:border-cyan-400/50 transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-white group-hover:text-cyan-300">2 Dải Đứng (Cặp đôi)</div>
                    <div className="text-[10px] text-white/50">A4 Dọc • 2 dải ở giữa</div>
                  </button>

                  <button
                    onClick={() => applyPreset('4-strip-horizontal')}
                    className="p-2.5 rounded-xl text-left liquid-glass-interactive border border-white/10 hover:border-cyan-400/50 transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-white group-hover:text-cyan-300">4 Dải Ngang (Tiết kiệm)</div>
                    <div className="text-[10px] text-white/50">A4 Dọc • 4 dải ngang</div>
                  </button>

                  <button
                    onClick={() => applyPreset('4-strip-landscape')}
                    className="p-2.5 rounded-xl text-left liquid-glass-interactive border border-white/10 hover:border-cyan-400/50 transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-white group-hover:text-cyan-300">4 Dải Đứng (A4 Ngang)</div>
                    <div className="text-[10px] text-white/50">A4 Ngang • 4 dải đứng</div>
                  </button>

                  <button
                    onClick={() => applyPreset('5-strip-max')}
                    className="p-2.5 rounded-xl text-left liquid-glass-interactive border border-white/10 hover:border-cyan-400/50 transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-white group-hover:text-cyan-300">5 Dải (Tối đa A4)</div>
                    <div className="text-[10px] text-white/50">A4 Dọc • 5 dải tối đa</div>
                  </button>
                </div>
              </div>

              {/* Tùy chỉnh trang A4 & Dải ảnh */}
              <div className="flex flex-col gap-3">
                <label className="text-xs text-white/50 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Tùy chỉnh Dải Ảnh & Trang In
                </label>

                {/* Hướng giấy */}
                <div className="flex items-center justify-between liquid-glass p-3 rounded-xl border border-white/10">
                  <span className="text-xs text-white/80">Hướng giấy A4:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setOrientation('portrait')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isPortrait 
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50' 
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      A4 Đứng
                    </button>
                    <button
                      onClick={() => setOrientation('landscape')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        !isPortrait 
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50' 
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      A4 Ngang
                    </button>
                  </div>
                </div>

                {/* Số lượng dải ảnh trên trang */}
                <div className="flex items-center justify-between liquid-glass p-3 rounded-xl border border-white/10">
                  <div>
                    <span className="text-xs text-white/80 block">Số dải ảnh trên tờ A4:</span>
                    <span className="text-[10px] text-white/40">In {strips.length} dải / 1 tờ A4</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeStrip(strips[strips.length - 1]?.id)}
                      disabled={strips.length <= 1}
                      className="w-8 h-8 rounded-lg liquid-glass-pill hover:border-cyan-400/40 text-cyan-300 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold text-base cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-base font-black text-white w-6 text-center">{strips.length}</span>
                    <button
                      onClick={addStrip}
                      disabled={strips.length >= 8}
                      className="w-8 h-8 rounded-lg liquid-glass-pill hover:border-cyan-400/40 text-cyan-300 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold text-base cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Bật tắt nét đứt cắt kéo */}
                <label className="flex items-center justify-between liquid-glass p-3 rounded-xl border border-white/10 cursor-pointer">
                  <span className="text-xs text-white/80 flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-cyan-400" />
                    Đường nét đứt hướng dẫn cắt kéo
                  </span>
                  <input
                    type="checkbox"
                    checked={showCutLines}
                    onChange={(e) => setShowCutLines(e.target.checked)}
                    className="w-4 h-4 accent-cyan-400 cursor-pointer rounded"
                  />
                </label>
              </div>

              {/* Thông tin máy in */}
              <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Máy in được chỉ định:</span>
                <span className="text-xs text-cyan-300 font-bold truncate">
                  {selectedPrinter || 'Chưa chọn máy in (Vui lòng chọn ở màn hình chính)'}
                </span>
              </div>
            </div>

            {/* Nút hành động chính ở dưới */}
            <div className="flex flex-col gap-2.5 pt-4 border-t border-white/10">
              <button
                onClick={handleConfirmPrint}
                disabled={isPrinting}
                className="w-full py-4 rounded-2xl liquid-btn-cyber text-base font-black tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(6,182,212,0.4)] cursor-pointer"
              >
                <Printer className="w-5 h-5" />
                <span>{isPrinting ? 'Đang gửi in...' : 'XÁC NHẬN IN TRANG A4'}</span>
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl liquid-glass-pill text-white/60 hover:text-white text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
              >
                Hủy / Đóng lại
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default A4PrintArrangerModal;