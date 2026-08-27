import re
with open("src/components/WebPrototype.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Interfaces
content = content.replace("onSyncReceived: (callback: (data: any) => void) => void;", """onSyncReceived: (callback: (data: any) => void) => void;
      getPrinters?: () => Promise<any[]>;
      printImage?: (data: any) => Promise<{success: boolean, error?: string}>;
      getSavedPrinter?: () => Promise<string>;
      savePrinter?: (name: string) => Promise<boolean>;""")

# 2. States
content = content.replace("const [saveDirectory, setSaveDirectory] = useState<string>('');\n\n  useEffect(() => {\n    if ((window as any).electronAPI && (window as any).electronAPI.getSaveDirectory) {\n      (window as any).electronAPI.getSaveDirectory().then((dir: string) => setSaveDirectory(dir));\n    }\n  }, []);", """const [saveDirectory, setSaveDirectory] = useState<string>('');
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
  };""")

# 3. Handle Print
content = re.sub(r"const handlePrint = \(\) => \{[\s\S]*?printWindow\.document\.close\(\);\s*\}\s*\}", """const handlePrint = async () => {
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
  }""", content)

# 4. Supabase
content = content.replace("""const result = await (window as any).electronAPI.saveSession({
              sessionName: currentSessionName,
              finalImage: data,
              rawImages: capturedImages
           });
           if (result.success) {
              console.log('Session saved to PC successfully (Admin):', result.folderPath);
              if (result.downloadUrl) setSessionDlUrl(result.downloadUrl);
           } else {
              console.error('Failed to save to PC (Admin):', result.error);
              setSessionDlUrl('');
           }""", """(window as any).electronAPI.saveSession({
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
           } catch(e) { console.error("Loi Supabase Admin", e); }""")

content = content.replace("setSessionDlUrl('Đang tạo link...');", "")

# 5. UI
content = content.replace("""</button>
           </div>

           {/* Saved Frames List */}""", """</button>
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

           {/* Saved Frames List */}""")

with open("src/components/WebPrototype.tsx", "w", encoding="utf-8") as f:
    f.write(content)

