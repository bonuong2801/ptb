import re
with open("src/components/WebPrototype.tsx", "r", encoding="utf-8") as f:
    content = f.read()

target = """      const webUrl = `https://neobooth-web.vercel.app/?id=${currentSessionName}`;
      setSessionDlUrl(webUrl);

      const videoBase64 = await blobToBase64(recordedVideoBlob);
      if ((window as any).electronAPI) {
        (window as any).electronAPI.saveSession({
          sessionName: currentSessionName,
          finalImage: finalImage,
          rawImages: capturedImages,
          videoBase64: videoBase64
        });
      }

      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient('https://riqgdjwcvritldlsboji.supabase.co', 'sb_publishable_94Aov-K-1KUb_EVj2yxe7g_PJSLePRW');
        
        supabase.storage.from('cgbooth').upload(`${currentSessionName}/bts_video.webm`, recordedVideoBlob, { contentType: 'video/webm' });
        
        const finalBlob = await (await fetch(finalImage)).blob();
        supabase.storage.from('cgbooth').upload(`${currentSessionName}/final_strip.jpg`, finalBlob, { contentType: 'image/jpeg' });
        
        capturedImages.forEach(async (img, idx) => {
           const rawBlob = await (await fetch(img)).blob();
           supabase.storage.from('cgbooth').upload(`${currentSessionName}/raw_photo_${idx + 1}.jpg`, rawBlob, { contentType: 'image/jpeg' });
        });
      } catch (err) {
        console.error("Lỗi upload Supabase:", err);
      }"""

repl = """      const videoBase64 = await blobToBase64(recordedVideoBlob);
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
      }"""

content = content.replace(target, repl)

# Also remove Vite environment variables which caused the typescript error!
content = content.replace("""  // Helpers for Cloudinary
  const uploadToCloud = async (base64Data: string, type: 'image' | 'video' = 'image'): Promise<string | null> => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !preset) return null;
    const formData = new FormData();
    formData.append('file', base64Data);
    formData.append('upload_preset', preset);
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      return data.public_id || null;
    } catch(e) { return null; }
  };""", "")

with open("src/components/WebPrototype.tsx", "w", encoding="utf-8") as f:
    f.write(content)

