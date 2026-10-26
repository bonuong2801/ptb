import { CustomFrameConfig } from '../types/booth';

// Utility to compose final strip with photo rotation & frame layering
export const generateFinalImage = async (config: CustomFrameConfig, capturedImages: string[]): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const isSquare = config.frameShape === 'square';
    canvas.width = 1200;
    canvas.height = isSquare ? 1200 : 3600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve('');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
              const rotation = layout.rotation || 0;

              ctx.save();
              if (rotation !== 0) {
                const cx = x + w / 2;
                const cy = y + h / 2;
                ctx.translate(cx, cy);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.translate(-cx, -cy);
              }

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
          frameImg.onerror = () => { res(); };
          frameImg.src = config.frameImage!;
        });
      }
    };

    const layerMode = config.frameLayering || 'above';
    if (layerMode === 'above') {
       drawPhotos().then(() => drawFrame()).then(() => resolve(canvas.toDataURL('image/jpeg', 0.92)));
    } else {
       drawFrame().then(() => drawPhotos()).then(() => resolve(canvas.toDataURL('image/jpeg', 0.92)));
    }
  });
};

export interface A4StripItem {
  id: string;
  x: number; // % toạ độ x trên tờ giấy A4 (0 - 100)
  y: number; // % toạ độ y trên tờ giấy A4 (0 - 100)
  rotation: 0 | 90; // 0: đứng (5x15cm), 90: ngang (15x5cm)
}

// Hàm render toàn bộ trang A4 ở chuẩn in ấn 300 DPI
export const renderA4PrintCanvas = async (
  stripImage: string,
  strips: A4StripItem[],
  orientation: 'portrait' | 'landscape' = 'portrait',
  showCutLines: boolean = true
): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    // Chuẩn in 300 DPI cho A4: 210 x 297 mm
    // 210mm * 11.811 = 2480 px, 297mm * 11.811 = 3508 px
    const isPortrait = orientation === 'portrait';
    canvas.width = isPortrait ? 2480 : 3508;
    canvas.height = isPortrait ? 3508 : 2480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve('');

    // Nền trắng tinh của giấy in ảnh A4
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      const isSquare = Math.abs(img.width - img.height) < 50;
      // Kích thước thật khi in: Dải chuẩn 50 x 150 mm hoặc Vuông 100 x 100 mm
      const baseWidthMM = isSquare ? 100 : 50;
      const baseHeightMM = isSquare ? 100 : 150;
      const mmToPx = 300 / 25.4; // ~11.811 px / mm

      const stripWidthPx = baseWidthMM * mmToPx; // ~590.55 px
      const stripHeightPx = baseHeightMM * mmToPx; // ~1771.65 px

      strips.forEach((strip) => {
        const posX = (strip.x / 100) * canvas.width;
        const posY = (strip.y / 100) * canvas.height;
        const isRotated = strip.rotation === 90;

        const renderW = isRotated ? stripHeightPx : stripWidthPx;
        const renderH = isRotated ? stripWidthPx : stripHeightPx;

        ctx.save();
        const centerX = posX + renderW / 2;
        const centerY = posY + renderH / 2;
        ctx.translate(centerX, centerY);

        if (isRotated) {
          ctx.rotate((90 * Math.PI) / 180);
          ctx.drawImage(img, -stripWidthPx / 2, -stripHeightPx / 2, stripWidthPx, stripHeightPx);
        } else {
          ctx.drawImage(img, -stripWidthPx / 2, -stripHeightPx / 2, stripWidthPx, stripHeightPx);
        }
        ctx.restore();

        // Vẽ đường nét đứt và dấu cắt hướng dẫn
        if (showCutLines) {
          ctx.save();
          ctx.strokeStyle = '#a3a3a3';
          ctx.lineWidth = 3;
          ctx.setLineDash([16, 12]);
          ctx.strokeRect(posX, posY, renderW, renderH);

          // Vẽ dấu góc (corner crop marks)
          const markLen = 30;
          ctx.setLineDash([]);
          ctx.strokeStyle = '#737373';
          ctx.lineWidth = 2.5;

          // Top-left
          ctx.beginPath();
          ctx.moveTo(posX - markLen, posY);
          ctx.lineTo(posX, posY);
          ctx.lineTo(posX, posY - markLen);
          ctx.stroke();

          // Top-right
          ctx.beginPath();
          ctx.moveTo(posX + renderW + markLen, posY);
          ctx.lineTo(posX + renderW, posY);
          ctx.lineTo(posX + renderW, posY - markLen);
          ctx.stroke();

          // Bottom-left
          ctx.beginPath();
          ctx.moveTo(posX - markLen, posY + renderH);
          ctx.lineTo(posX, posY + renderH);
          ctx.lineTo(posX, posY + renderH + markLen);
          ctx.stroke();

          // Bottom-right
          ctx.beginPath();
          ctx.moveTo(posX + renderW + markLen, posY + renderH);
          ctx.lineTo(posX + renderW, posY + renderH);
          ctx.lineTo(posX + renderW, posY + renderH + markLen);
          ctx.stroke();

          // Ký hiệu cây kéo nhỏ ở mép cắt
          ctx.font = '28px sans-serif';
          ctx.fillStyle = '#737373';
          ctx.fillText('✂', posX + renderW / 2 - 12, Math.max(35, posY - 8));
          ctx.restore();
        }
      });

      resolve(canvas.toDataURL('image/jpeg', 0.98));
    };

    img.onerror = () => {
      resolve('');
    };

    img.src = stripImage;
  });
};

// Cached IndexedDB wrapper for large images & frames bypassing localStorage limits
let dbInstancePromise: Promise<IDBDatabase> | null = null;
export const syncDB = {
  async init() {
    if (!dbInstancePromise) {
      dbInstancePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('photobooth_sync', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('assets');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          dbInstancePromise = null;
          reject(req.error);
        };
      });
    }
    return dbInstancePromise;
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
