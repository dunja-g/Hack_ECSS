"""PHANTOM FUSION game server.

Serves the game (static files) and one small API that forwards a photo to
Gemma 4 running in Ollama, then cleans up the JSON level it returns.

Standard library only, so it runs anywhere Python 3.10+ runs.

Environment variables:
  OLLAMA_URL    where Ollama listens          (default http://localhost:11434)
  GEMMA_MODEL   which Gemma 4 model to use     (default gemma4:e4b-it-qat)
  GAME_DIR      folder with the game files     (default ../game)
  PORT          port for this server           (default 8081)
"""

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
GEMMA_MODEL = os.environ.get("GEMMA_MODEL", "gemma4:e4b-it-qat")
GAME_DIR = Path(os.environ.get("GAME_DIR", HERE.parent / "game")).resolve()
PORT = int(os.environ.get("PORT", "8081"))
TIMEOUT = int(os.environ.get("OLLAMA_TIMEOUT", "600"))
SYSTEM_PROMPT = (HERE / "prompt.txt").read_text(encoding="utf-8")

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
SHAPES = {"box", "cylinder", "sphere"}
LIGHTING = {"day", "dusk", "night", "neon"}
TYPES = {"desk", "table", "chair", "sofa", "bed", "shelf", "cabinet", "monitor", "laptop", "tv",
         "lamp", "plant", "whiteboard", "door", "window", "box"}
WALLS = {"back", "front", "left", "right"}
GHOST_NAMES = ["Kurayami", "Hollowmi", "Shirei", "Bakeneko-chan", "Yurei-X", "Onibi"]


# ---------------------------------------------------------------- level cleanup
def _num(value, default, lo, hi):
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = default
    return max(lo, min(hi, v))


def _opt(value, lo, hi):
    """Like _num, but missing or junk values stay None so the game can pick a sensible default."""
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return None


def _hex(value, default):
    return value if isinstance(value, str) and HEX.match(value) else default


def clean_scene(data):
    """Gemma's room description (walls + groups). Keep it tidy; the game's layout engine builds the furniture."""
    text = lambda v, n: str(v)[:n] if v is not None else None
    size = data.get("size_guess") or {}
    palette = data.get("palette") or {}
    walls = data.get("walls") if isinstance(data.get("walls"), dict) else {}
    groups = []
    for g in (data.get("groups") or [])[:12]:
        if not isinstance(g, dict):
            continue
        clean = {k: text(g.get(k), 40) for k in ("type", "name", "layout", "where", "on", "with") if g.get(k) is not None}
        clean["count"] = int(_num(g.get("count"), 1, 1, 24))
        if g.get("rows") is not None:
            clean["rows"] = int(_num(g.get("rows"), 1, 1, 8))
        clean["color"] = _hex(g.get("color"), None)
        clean["divider"] = bool(g.get("divider"))
        groups.append(clean)
    haunted = []
    for h in (data.get("haunted") or [])[:5]:
        if isinstance(h, dict):
            gh = h.get("ghost") if isinstance(h.get("ghost"), dict) else {}
            haunted.append({"object": text(h.get("object"), 40), "ghost": {
                "name": text(gh.get("name"), 30), "personality": text(gh.get("personality"), 100),
                "hp": _num(gh.get("hp"), 100, 60, 200), "speed": _num(gh.get("speed"), 2.5, 1, 4)}})
    scene = {
        "room_name": text(data.get("room_name") or "Unnamed Haunt", 60),
        "vibe": text(data.get("vibe") or "Something stirs in the shadows.", 200),
        "boss_line": text(data.get("boss_line") or "You should not have opened this door...", 140),
        "room_type": text(data.get("room_type"), 20),
        "shape": data.get("shape") if data.get("shape") in ("long", "wide", "square") else "square",
        "size_guess": {"width": _opt(size.get("width"), 6, 30), "depth": _opt(size.get("depth"), 6, 30),
                       "height": _opt(size.get("height"), 2.4, 8)},
        "palette": {k: _hex(palette.get(k), d) for k, d in
                    (("floor", "#3b3355"), ("walls", "#5a4b8a"), ("accent", "#ff4d8d"), ("fog", "#1a1430"))},
        "lighting": data.get("lighting") if data.get("lighting") in LIGHTING else "day",
        "walls": {side: [text(e, 30) for e in (walls.get(side) or [])[:8] if e] for side in WALLS},
        "groups": groups,
        "haunted": haunted,
    }
    if not groups and not any(scene["walls"].values()):
        raise ValueError("model described an empty room")
    return scene


def clean_level(data):
    """Make any model reply safe for the game: clamp numbers, fill gaps."""
    if not isinstance(data, dict):
        raise ValueError("model reply is not a JSON object")
    if isinstance(data.get("groups"), list) or isinstance(data.get("walls"), dict):
        return clean_scene(data)

    size = data.get("size") or {}
    palette = data.get("palette") or {}
    level = {
        "room_name": str(data.get("room_name") or "Unnamed Haunt")[:60],
        "vibe": str(data.get("vibe") or "Something stirs in the shadows.")[:200],
        "size": {
            "width": _num(size.get("width"), 16, 10, 30),
            "depth": _num(size.get("depth"), 16, 10, 30),
            "height": _num(size.get("height"), 5, 3, 8),
        },
        "palette": {
            "floor": _hex(palette.get("floor"), "#3b3355"),
            "walls": _hex(palette.get("walls"), "#5a4b8a"),
            "accent": _hex(palette.get("accent"), "#ff4d8d"),
            "fog": _hex(palette.get("fog"), "#1a1430"),
        },
        "lighting": data.get("lighting") if data.get("lighting") in LIGHTING else "night",
        "boss_line": str(data.get("boss_line") or "You should not have opened this door...")[:140],
        "objects": [],
    }

    for obj in (data.get("objects") or [])[:20]:
        if not isinstance(obj, dict):
            continue
        pos = obj.get("pos") or [0.5, 0.5]
        sz = obj.get("size") or [1, 1, 1]
        if not (isinstance(pos, list) and len(pos) >= 2):
            pos = [0.5, 0.5]
        if not (isinstance(sz, list) and len(sz) >= 3):
            sz = [1, 1, 1]
        x, z = _num(pos[0], 0.5, 0.05, 0.95), _num(pos[1], 0.5, 0.05, 0.95)
        # keep the spawn point clear
        if abs(x - 0.5) < 0.15 and z > 0.78:
            z = 0.7
        clean = {
            "name": str(obj.get("name") or "thing")[:40],
            "shape": obj.get("shape") if obj.get("shape") in SHAPES else "box",
            "pos": [round(x, 3), round(z, 3)],
            "size": [_num(sz[0], 1, 0.03, 6), _num(sz[1], 1, 0.03, 4), _num(sz[2], 1, 0.03, 6)],
            "color": _hex(obj.get("color"), "#8a7bd8"),
            "elevation": _num(obj.get("elevation"), 0, 0, 2.5),
            "haunted": bool(obj.get("haunted")),
            # the game builds a model per type and guesses one from the name when it is missing
            "type": obj.get("type") if obj.get("type") in TYPES else None,
            "rotation": _num(obj.get("rotation"), 0, -360, 360),
            "wall": obj.get("wall") if obj.get("wall") in WALLS else None,
        }
        if clean["haunted"]:
            g = obj.get("ghost") or {}
            clean["ghost"] = {
                "name": str(g.get("name") or GHOST_NAMES[len(level["objects"]) % len(GHOST_NAMES)])[:30],
                "personality": str(g.get("personality") or "restless and grumpy")[:100],
                "hp": _num(g.get("hp"), 100, 60, 200),
                "speed": _num(g.get("speed"), 2.5, 1, 4),
            }
        level["objects"].append(clean)

    if not level["objects"]:
        raise ValueError("model found no objects in the photo")

    # The game needs at least 2 haunted objects. Haunt the biggest ones if needed.
    haunted = [o for o in level["objects"] if o["haunted"]]
    if len(haunted) < 2:
        by_size = sorted(level["objects"], key=lambda o: -(o["size"][0] * o["size"][1] * o["size"][2]))
        for o in by_size:
            if len([h for h in level["objects"] if h["haunted"]]) >= 2:
                break
            if not o["haunted"]:
                o["haunted"] = True
                o["ghost"] = {
                    "name": GHOST_NAMES[level["objects"].index(o) % len(GHOST_NAMES)],
                    "personality": f"the restless spirit of the {o['name']}",
                    "hp": 100,
                    "speed": 2.5,
                }
    return level


def extract_json(text):
    """Pull the first JSON object out of a model reply (handles ``` fences)."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model reply")
    return json.loads(text[start : end + 1])


# ---------------------------------------------------------------- ollama calls
def ollama_request(path, payload=None, timeout=10):
    url = OLLAMA_URL + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def ask_gemma(image_b64, hint=""):
    user_text = "Fuse this photo into a PHANTOM FUSION arena."
    if hint:
        user_text += f" Player's wish for the arena: {hint[:200]}"
    payload = {
        "model": GEMMA_MODEL,
        "stream": False,
        "format": "json",
        "think": False,
        "options": {"temperature": 0.5, "num_ctx": 8192},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_text, "images": [image_b64]},
        ],
    }
    try:
        reply = ollama_request("/api/chat", payload, timeout=TIMEOUT)
    except urllib.error.HTTPError as err:
        # Some Ollama versions reject "think" for some models; retry without it.
        if err.code == 400:
            payload.pop("think", None)
            reply = ollama_request("/api/chat", payload, timeout=TIMEOUT)
        else:
            raise
    return reply.get("message", {}).get("content", "")


# ---------------------------------------------------------------- http handler
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(GAME_DIR), **kwargs)

    def end_headers(self):
        # always revalidate, so "save then refresh" picks up edits to game files
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[phantom] " + (fmt % args) + "\n")

    def _json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/api/health"):
            try:
                tags = ollama_request("/api/tags")
                names = [m.get("name", "") for m in tags.get("models", [])]
                ready = any(n == GEMMA_MODEL or n == GEMMA_MODEL + ":latest" for n in names)
                self._json(200, {"ollama": True, "model": GEMMA_MODEL, "model_ready": ready, "models": names})
            except Exception as err:  # noqa: BLE001
                self._json(200, {"ollama": False, "model": GEMMA_MODEL, "model_ready": False, "error": str(err)})
            return
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/analyze":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 15_000_000:
                return self._json(413, {"error": "image too large, keep it under 10 MB"})
            body = json.loads(self.rfile.read(length) or b"{}")
            image = body.get("image", "")
            if "," in image[:100]:  # strip "data:image/jpeg;base64,"
                image = image.split(",", 1)[1]
            base64.b64decode(image[:1000] + "=" * (-len(image[:1000]) % 4))  # sanity check
            if not image:
                return self._json(400, {"error": "no image sent"})
        except Exception as err:  # noqa: BLE001
            return self._json(400, {"error": f"bad request: {err}"})

        started = time.time()
        try:
            raw = ask_gemma(image, str(body.get("hint", "")))
        except Exception as err:  # noqa: BLE001
            return self._json(502, {"error": f"could not reach Gemma at {OLLAMA_URL}: {err}"})
        try:
            level = clean_level(extract_json(raw))
        except Exception as err:  # noqa: BLE001
            return self._json(502, {"error": f"Gemma replied but the level was not usable: {err}", "raw": raw[:2000]})
        return self._json(200, {"level": level, "model": GEMMA_MODEL, "seconds": round(time.time() - started, 1)})


def main():
    print(f"PHANTOM FUSION on http://localhost:{PORT}  (Gemma: {GEMMA_MODEL} at {OLLAMA_URL})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
