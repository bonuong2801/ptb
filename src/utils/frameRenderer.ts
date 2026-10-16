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
