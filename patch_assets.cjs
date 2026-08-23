const fs = require('fs');
let code = fs.readFileSync('src/components/WebPrototype.tsx', 'utf8');

const target = `      const broadcastAssets = async () => {
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

        const payloadCaptured = await Promise.all(capturedImages.map(async (img, i) => {
           if (img) {
              // Not debouncing captures aggressively since they only happen ~totalShots times
              try {
                 await syncDB.set(\`shared_captured_\${i}\`, img);
                 return \`USE_INDEXEDDB_\${i}\`;
              } catch(e) { return img; }
           }
           return img;
        }));`;

const replace = `      const broadcastAssets = async () => {
        const payloadConfig = { ...customConfig };
        if (payloadConfig.frameImage) {
            if (!(window as any).electronAPI) {
                if (payloadConfig.frameImage !== prevFrameRef.current) {
                    try {
                       await syncDB.set('shared_frame_image', payloadConfig.frameImage);
                       prevFrameRef.current = payloadConfig.frameImage;
                    } catch(e) {}
                }
                payloadConfig.frameImage = 'USE_INDEXEDDB';
            }
        } else {
            prevFrameRef.current = null;
        }

        const payloadCaptured = await Promise.all(capturedImages.map(async (img, i) => {
           if (img) {
              if (!(window as any).electronAPI) {
                  try {
                     await syncDB.set(\`shared_captured_\${i}\`, img);
                     return \`USE_INDEXEDDB_\${i}\`;
                  } catch(e) { return img; }
              }
           }
           return img;
        }));`;

if (code.includes(target)) {
  code = code.replace(target, replace);
  fs.writeFileSync('src/components/WebPrototype.tsx', code);
  console.log("Success patch broadcast Assets");
} else {
  console.log("Target not found");
}
