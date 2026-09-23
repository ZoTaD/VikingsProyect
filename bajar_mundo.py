"""Baja la carpeta del mundo "Villa Lujan" desde el servidor de DatHost.

Usa la API de DatHost con el email y la contraseña de la cuenta, que tienen que estar en
las variables de entorno DATHOST_EMAIL y DATHOST_PASSWORD. Este script nunca las muestra.

Guarda el zip en Desktop\\valheim-mundo\\mundo.zip y lo descomprime en
Desktop\\valheim-mundo\\Villa Lujan\\. Pisa la copia anterior.

Después de bajar corre leer_cofres.py, que actualiza stock.json y stock.js.

Uso:  python bajar_mundo.py
"""
import base64
import io
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

SERVER_ID = "6aa03fb849bf1e146c63cee3"
WORLD_PATH = "SaveDir/worlds_local/Villa Lujan"
OUT = Path(os.environ.get("VALHEIM_OUT") or Path.home() / "Desktop" / "valheim-mundo")


def main() -> int:
    email = os.environ.get("DATHOST_EMAIL")
    password = os.environ.get("DATHOST_PASSWORD")
    if not email or not password:
        print("Faltan las variables DATHOST_EMAIL y DATHOST_PASSWORD.")
        return 2

    url = f"https://dathost.com/api/0.1/game-servers/{SERVER_ID}/files/" + urllib.parse.quote(WORLD_PATH)
    token = base64.b64encode(f"{email}:{password}".encode()).decode()
    req = urllib.request.Request(url, headers={"Authorization": "Basic " + token, "User-Agent": "valheim-despensa/1.0"})
    data = None
    for intento in range(1, 5):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = r.read()
            zipfile.ZipFile(io.BytesIO(data)).testzip()
            break
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):
                print(f"DatHost respondió {e.code}. Si es 401, revisá el email o la contraseña.")
                return 1
            print(f"Intento {intento}: DatHost respondió {e.code}")
        except Exception as e:  # corte de conexión o zip incompleto
            print(f"Intento {intento}: la descarga se cortó ({type(e).__name__})")
        data = None
        time.sleep(15 * intento)
    if data is None:
        print("No se pudo bajar el mundo después de 4 intentos.")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "mundo.zip").write_bytes(data)
    dest = OUT / "Villa Lujan"
    tmp = OUT / "Villa Lujan.tmp"
    if tmp.exists():
        for p in sorted(tmp.rglob("*"), reverse=True):
            p.unlink() if p.is_file() else p.rmdir()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        z.extractall(tmp)
    if dest.exists():
        for p in sorted(dest.rglob("*"), reverse=True):
            p.unlink() if p.is_file() else p.rmdir()
        dest.rmdir()
    tmp.rename(dest)
    (OUT / "ultima_descarga.txt").write_text(time.strftime("%Y-%m-%d %H:%M:%S"), encoding="utf-8")
    print(f"OK: {len(data) / 1e6:.1f} MB en {dest}")
    import subprocess
    return subprocess.call([sys.executable, str(Path(__file__).parent / "leer_cofres.py")])


if __name__ == "__main__":
    sys.exit(main())
