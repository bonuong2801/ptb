import re
with open("electron/main.cjs", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("const bin = require('cloudflared').bin;", "const bin = require('cloudflared').bin.replace('app.asar', 'app.asar.unpacked');")

with open("electron/main.cjs", "w", encoding="utf-8") as f:
    f.write(content)

