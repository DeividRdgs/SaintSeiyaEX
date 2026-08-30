# Servidor local com fallback de SPA — imita o _redirects do Netlify.
# Uso: python tools/serve.py  →  http://localhost:8123/
# Rotas como /herois, /team-builder etc. servem o index.html (como em produção).
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123

class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            self.path = "/index.html"
        return super().send_head()

if __name__ == "__main__":
    print(f"TRIADE local: http://localhost:{PORT}/  (Ctrl+C para parar)")
    ThreadingHTTPServer(("", PORT), SpaHandler).serve_forever()
