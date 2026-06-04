#!/usr/bin/env python3
"""Launch the GLB Turntable Video web app.

Starts a tiny static file server for the app/ directory and opens it in the
default browser. The app is fully client-side (Three.js + ffmpeg.wasm) — this
server only serves the static files; no rendering happens here.

Usage:
    python serve.py [--port PORT] [--model PATH_TO_GLB] [--no-browser]
"""
import argparse
import http.server
import os
import shutil
import socket
import threading
import webbrowser
from functools import partial

APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")


def free_port(preferred):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--model", help="Optional path to a .glb to auto-load")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    query = ""
    # If a model is given, copy it next to the app so the page can fetch it.
    if args.model:
        src = os.path.abspath(args.model)
        if not os.path.isfile(src):
            raise SystemExit(f"Model not found: {src}")
        dst_name = "_autoload.glb"
        shutil.copyfile(src, os.path.join(APP_DIR, dst_name))
        query = f"?model={dst_name}"

    port = free_port(args.port)
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=APP_DIR)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://localhost:{port}/index.html{query}"
    print(f"GLB Turntable Video running at: {url}")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
