import re
with open("src/components/WebPrototype.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("getSaveDirectory?: () => Promise<string>;", """getSaveDirectory?: () => Promise<string>;
      getTunnelUrl?: () => Promise<string>;""")

with open("src/components/WebPrototype.tsx", "w", encoding="utf-8") as f:
    f.write(content)

