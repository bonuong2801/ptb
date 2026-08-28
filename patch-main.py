import re
with open("electron/main.cjs", "r", encoding="utf-8") as f:
    content = f.read()

# Add get-tunnel-url IPC
content = content.replace("ipcMain.handle('get-save-directory', () => {", """ipcMain.handle('get-tunnel-url', () => publicUrl);

ipcMain.handle('get-save-directory', () => {""")

# Replace Localtunnel with Cloudflared
content = re.sub(r"const localtunnel = require\('localtunnel'\);[\s\S]*?console\.error\(''\[CGBOOTH\] Failed to start Localtunnel:'', e\);\s*\}", """const { spawn } = require('child_process');
      const bin = require('cloudflared').bin;
      localTunnelInstance = spawn(bin, ["tunnel", "--url", `http://localhost:${SERVER_PORT}`]);
      localTunnelInstance.stderr.on('data', data => {
        const match = data.toString().match(/https:\\/\\/[a-z0-9-]+\\.trycloudflare\\.com/);
        if (match) {
          publicUrl = match[0];
          console.log(`[CGBOOTH] Cloudflare Tunnel running at: ${publicUrl}`);
        }
      });
      localTunnelInstance.on('close', () => {
        console.log('\[CGBOOTH\] Tunnel closed');
      });
    } catch (e) {
      console.error('\[CGBOOTH\] Failed to start Cloudflare Tunnel:', e);
    }""", content)

# Add gallery-template route
content = content.replace("photoServer.use('/session', express.static(currentDir));", """photoServer.use('/', express.static(path.join(__dirname, '../gallery-template')));
  photoServer.use('/session', express.static(currentDir));""")

with open("electron/main.cjs", "w", encoding="utf-8") as f:
    f.write(content)

