import re
with open("electron/preload.cjs", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),", """getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
  getTunnelUrl: () => ipcRenderer.invoke('get-tunnel-url'),""")

with open("electron/preload.cjs", "w", encoding="utf-8") as f:
    f.write(content)

