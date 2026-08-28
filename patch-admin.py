import re
with open("src/components/WebPrototype.tsx", "r", encoding="utf-8") as f:
    content = f.read()

target = """(window as any).electronAPI.saveSession({
              sessionName: currentSessionName,
              finalImage: data,
              rawImages: capturedImages,
              videoBase64: null
           });
           
           const webUrl = `https://neobooth-web.vercel.app/?id=${currentSessionName}`;
           setSessionDlUrl(webUrl);

           try {
             const { createClient } = await import("@supabase/supabase-js");
             const supabase = createClient("https://riqgdjwcvritldlsboji.supabase.co", "sb_publishable_94Aov-K-1KUb_EVj2yxe7g_PJSLePRW");
             
             const finalBlob = await (await fetch(data)).blob();
             supabase.storage.from("cgbooth").upload(`${currentSessionName}/final_strip.jpg`, finalBlob, { contentType: "image/jpeg" });
             
             capturedImages.forEach(async (img, idx) => {
                const rawBlob = await (await fetch(img)).blob();
                supabase.storage.from("cgbooth").upload(`${currentSessionName}/raw_photo_${idx + 1}.jpg`, rawBlob, { contentType: "image/jpeg" });
             });
           } catch(e) { console.error("Loi Supabase Admin", e); }"""

repl = """const result = await (window as any).electronAPI.saveSession({
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
           }"""

content = content.replace(target, repl)

with open("src/components/WebPrototype.tsx", "w", encoding="utf-8") as f:
    f.write(content)

