"""Si no se pudo bajar el mundo, recupera el último stock bueno desde la página publicada.

Lee window.STOCK de https://zotad.github.io/VikingsProyect/ y lo vuelve a escribir en
stock.json y stock.js, así la página nueva sale con los datos anteriores y un aviso de falla.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

SITE = "https://zotad.github.io/VikingsProyect/"
ROOT = Path(__file__).parent


def main() -> int:
    try:
        req = urllib.request.Request(SITE, headers={"User-Agent": "valheim-despensa/1.0", "Cache-Control": "no-cache"})
        html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    except Exception as e:
        print(f"No pude leer la página publicada: {e}")
        return 1
    m = re.search(r"window\.STOCK = (\{.*?\n\});", html, re.S)
    if not m:
        print("La página publicada no tiene datos de la casa.")
        return 1
    data = json.loads(m.group(1))
    text = json.dumps(data, indent=1, ensure_ascii=False)
    (ROOT / "stock.json").write_text(text, encoding="utf-8")
    (ROOT / "stock.js").write_text("window.STOCK = " + text + ";\n", encoding="utf-8")
    print(f"Recuperé el stock de {data.get('descarga')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
