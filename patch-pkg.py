import json
with open("package.json", "r", encoding="utf-8") as f:
    data = json.load(f)

data["build"]["asarUnpack"] = ["node_modules/cloudflared/**/*"]
data["build"]["files"].append("gallery-template/**/*")

with open("package.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

