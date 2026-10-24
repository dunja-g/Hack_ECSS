"""Fake Ollama for testing the game server without downloading Gemma.

  python scripts/mock_ollama.py          # listens on :11434
  OLLAMA_URL=http://localhost:11434 python server/server.py
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SAMPLE = (Path(__file__).resolve().parent.parent / "game" / "samples" / "dorm.json").read_text()
MODEL = sys.argv[1] if len(sys.argv) > 1 else "gemma4:e4b-it-qat"


class Mock(BaseHTTPRequestHandler):
    def _send(self, body):
        raw = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self._send({"models": [{"name": MODEL}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        assert body["messages"][1]["images"], "no image sent to Gemma"
        # reply the way a chatty model might: wrapped in a code fence
        self._send({"message": {"role": "assistant", "content": "```json\n" + SAMPLE + "\n```"}})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print("mock ollama on :11434")
    ThreadingHTTPServer(("0.0.0.0", 11434), Mock).serve_forever()
