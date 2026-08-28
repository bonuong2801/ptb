const { tunnel } = require("cloudflared"); const t = tunnel({"--url": "http://localhost:3001"}); t.on("url", url => {console.log("URL:", url); t.stop(); process.exit(0)});
