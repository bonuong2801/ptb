const fs = require('fs');
let code = fs.readFileSync('src/components/WebPrototype.tsx', 'utf8');

// 1. Update CustomFrameConfig
code = code.replace(
`  photoLayouts?: { x: number; y: number; width: number; height: number; }[];
}`, 
`  photoLayouts?: { x: number; y: number; width: number; height: number; }[];
  frameLayering?: 'above' | 'below';
}`);

// 2. Update generateFinalImage
const genFinalImageOld = `    const drawFrame = async () => {
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

    drawFrame().then(() => drawPhotos()).then(() => resolve(canvas.toDataURL('image/png')));`;

const genFinalImageNew = `    const drawFrame = async () => {
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
    }`;

code = code.replace(genFinalImageOld, genFinalImageNew);

// 3. Update StripPreview
const stripPreviewOld = `      {config.frameImage && (
         <img src={config.frameImage} className="absolute inset-0 w-full h-full object-fill z-20 pointer-events-none" alt="Overlay Frame" />
      )}`;

const stripPreviewNew = `      {config.frameImage && (
         <img src={config.frameImage} className={\`absolute inset-0 w-full h-full object-fill pointer-events-none \${config.frameLayering === 'below' ? 'z-0' : 'z-20'}\`} alt="Frame" />
      )}`;

code = code.replace(stripPreviewOld, stripPreviewNew);

// 4. Update VisualFrameEditor UI
const editorUIOld = `         <div className="flex flex-col items-end">
            <label className="text-xs text-white/50 uppercase tracking-widest block mb-1">Tỉ Lệ Khung</label>
            <div className="flex bg-black/50 p-1 rounded">
               <button onClick={() => setConfig(prev => ({...prev, frameShape: 'rectangle'}))} className={\`px-2 py-1 text-[10px] font-bold rounded \${config.frameShape === 'rectangle' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}\`}>Chữ Nhật</button>
               <button onClick={() => setConfig(prev => ({...prev, frameShape: 'square'}))} className={\`px-2 py-1 text-[10px] font-bold rounded \${config.frameShape === 'square' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}\`}>Vuông</button>
            </div>
         </div>
      </div>`;

const editorUINew = `         <div className="flex flex-col items-end gap-2">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest block mb-1">Tỉ Lệ Khung</label>
              <div className="flex bg-black/50 p-1 rounded">
                 <button onClick={() => setConfig(prev => ({...prev, frameShape: 'rectangle'}))} className={\`px-2 py-1 text-[10px] font-bold rounded \${config.frameShape === 'rectangle' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}\`}>Chữ Nhật</button>
                 <button onClick={() => setConfig(prev => ({...prev, frameShape: 'square'}))} className={\`px-2 py-1 text-[10px] font-bold rounded \${config.frameShape === 'square' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}\`}>Vuông</button>
              </div>
            </div>
            
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest block mb-1">Vị trí Khung</label>
              <div className="flex bg-black/50 p-1 rounded">
                 <button onClick={() => setConfig(prev => ({...prev, frameLayering: 'above'}))} className={\`px-2 py-1 text-[10px] font-bold rounded \${(!config.frameLayering || config.frameLayering === 'above') ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}\`}>Đè Lên Ảnh</button>
                 <button onClick={() => setConfig(prev => ({...prev, frameLayering: 'below'}))} className={\`px-2 py-1 text-[10px] font-bold rounded \${config.frameLayering === 'below' ? 'bg-amber-glow text-black' : 'text-white/50 hover:text-white'}\`}>Nằm Dưới Ảnh</button>
              </div>
            </div>
         </div>
      </div>`;

code = code.replace(editorUIOld, editorUINew);

// 5. Check if it worked
fs.writeFileSync('src/components/WebPrototype.tsx', code);
console.log("Success update_layering.cjs");
