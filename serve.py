"""Servidor local de La despensa: sirve la carpeta y acepta POST /save/<slug>.<ext>
para guardar en img/ las imágenes que el navegador baja de la wiki."""
import http.server, re, sys
from pathlib import Path
ROOT = Path(__file__).parent
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def do_POST(self):
        m = re.fullmatch(r"/save/([a-z0-9-]+\.(?:webp|png|jpg))", self.path)
        if not m: self.send_error(404); return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        (ROOT / "img").mkdir(exist_ok=True)
        (ROOT / "img" / m.group(1)).write_bytes(data)
        self.send_response(204); self.end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5190
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
