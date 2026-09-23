"""Arma una sola página con CSS, JS, imágenes y stock embebidos.

  python build_artifact.py                              -> dist/la-despensa.html (artifact de Claude)
  python build_artifact.py --standalone --out site/index.html   -> página completa para GitHub Pages
"""
import argparse, base64, re
from pathlib import Path
ROOT = Path(__file__).parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r'\s*<script src="[^"]+"></script>', "", body)
fonts = re.search(r'(<link rel="preconnect".*?rel="stylesheet">)', html, re.S).group(1)
fonts = re.sub(r'\s*<link rel="stylesheet" href="styles.css">', "", fonts)
mime = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}
imgs = {p.stem: f"data:{mime[p.suffix]};base64,{base64.b64encode(p.read_bytes()).decode()}"
        for p in sorted((ROOT / "img").iterdir())}
img_js = "window.IMG = {\n" + ",\n".join(f'  "{k}": "{v}"' for k, v in imgs.items()) + "\n};"
out = f"""<title>La despensa</title>
<style>
{(ROOT / "styles.css").read_text(encoding="utf-8")}
</style>
{fonts}
{body.strip()}
<script>
{img_js}
</script>
<script>
{(ROOT / "data.js").read_text(encoding="utf-8")}
</script>
<script>
{(ROOT / "stock.js").read_text(encoding="utf-8") if (ROOT / "stock.js").exists() else ""}
</script>
<script>
{(ROOT / "app.js").read_text(encoding="utf-8")}
</script>
"""
ap = argparse.ArgumentParser()
ap.add_argument("--out", default="dist/la-despensa.html")
ap.add_argument("--standalone", action="store_true", help="agrega doctype, head y body")
args = ap.parse_args()
if args.standalone:
    out = ("<!doctype html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n"
           "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
           + out.replace("</style>", "</style>\n</head>\n<body>", 1) + "</body>\n</html>\n")
dest = ROOT / args.out
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out, encoding="utf-8")
print(f"{args.out}  {len(out)/1024:.0f} KB, {len(imgs)} imágenes")
