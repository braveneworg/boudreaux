#!/usr/bin/env python3
"""Serve the factory dashboard and proxy its GitHub reads through the gh CLI.

Run: python3 factory/serve.py [--port 8765] [--repo owner/name]

The dashboard is a static page that needs to read the repository's issues
and their comments. The browser cannot call GitHub with the user's gh login,
so this server does it: every GET /api/<path> becomes
`gh api repos/<owner>/<name>/<path>` and its status, body and caching headers
are passed back unchanged. Only GET is served, only the issue list and issue
comments can be read, only a strict character set is accepted in the query,
requests must carry a local Host header, and gh runs with an argument list,
never a shell, so the page cannot be used to read or run anything else.

Python 3 standard library only.
"""

import argparse
import json
import re
import subprocess
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

FACTORY_DIR = Path(__file__).resolve().parent
DEFAULT_PORT = 8765
GH_TIMEOUT_SECONDS = 30
GH_URL = "https://cli.github.com"

REPO_PATTERN = re.compile(r"[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+")
# The dashboard reads only the issue list and each issue's comments. Nothing
# else in the repository API is reachable through this server.
API_PATH_PATTERN = re.compile(r"issues(/\d+/comments)?")
LOCAL_HOSTS = ("127.0.0.1", "localhost", "[::1]")
QUERY_PATTERN = re.compile(r"[A-Za-z0-9_.,=&%+:\-]*")
STATUS_LINE_PATTERN = re.compile(r"^HTTP/\S+\s+(\d{3})")
FORWARDED_HEADERS = ("ETag", "X-RateLimit-Remaining", "X-RateLimit-Reset")


def run_gh(argv):
    """Runs gh with an argument list. UTF-8 whatever the locale, so a comment
    with non-ASCII text never raises out of a request."""
    return subprocess.run(
        argv, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=GH_TIMEOUT_SECONDS,
    )


def detect_repo():
    """Asks gh which repository the current directory belongs to."""
    argv = ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]
    try:
        run = run_gh(argv)
    except FileNotFoundError:
        sys.exit(
            f"gh was not found on the PATH. Install it from {GH_URL} and run "
            "`gh auth login`, or pass --repo owner/name."
        )
    except subprocess.TimeoutExpired:
        sys.exit("gh repo view did not answer in time. Pass --repo owner/name.")
    repo = run.stdout.strip()
    if run.returncode != 0 or not REPO_PATTERN.fullmatch(repo):
        detail = run.stderr.strip() or repo or "no output"
        sys.exit(f"gh repo view failed: {detail}. Pass --repo owner/name.")
    return repo


def split_gh_response(output):
    """Splits `gh api --include` output into (status, headers, body).

    Returns (None, {}, output) when no HTTP status line is present.
    """
    head, separator, body = output.partition("\n\n")
    lines = head.split("\n")
    match = STATUS_LINE_PATTERN.match(lines[0]) if lines else None
    if not separator or not match:
        return None, {}, output
    headers = {}
    for line in lines[1:]:
        name, colon, value = line.partition(":")
        if colon:
            headers[name.strip().lower()] = value.strip()
    return int(match.group(1)), headers, body


class Handler(SimpleHTTPRequestHandler):
    repo = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FACTORY_DIR), **kwargs)

    def do_GET(self):
        # A page on another origin whose hostname is rebound to 127.0.0.1
        # would otherwise read the repository with the user's gh login.
        host = self.headers.get("Host", "").rsplit(":", 1)[0]
        if host not in LOCAL_HOSTS:
            return self.send_json(HTTPStatus.FORBIDDEN, {"error": "unexpected Host header"})
        url = urlsplit(self.path)
        if url.path == "/":
            self.path = "/dashboard.html"
            return super().do_GET()
        if url.path == "/api/repo":
            return self.send_json(HTTPStatus.OK, {"nameWithOwner": self.repo})
        if url.path.startswith("/api/"):
            return self.proxy(url.path[len("/api/"):], url.query)
        return super().do_GET()

    def proxy(self, api_path, query):
        if not API_PATH_PATTERN.fullmatch(api_path):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid api path"})
        if not QUERY_PATTERN.fullmatch(query):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid query string"})

        endpoint = f"repos/{self.repo}/{api_path}"
        if query:
            endpoint = f"{endpoint}?{query}"
        argv = ["gh", "api", "--include", endpoint]
        etag = self.headers.get("If-None-Match")
        if etag:
            argv += ["-H", f"If-None-Match: {etag}"]

        try:
            run = run_gh(argv)
        except FileNotFoundError:
            return self.send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": f"gh was not found on the PATH. Install it from {GH_URL}."},
            )
        except subprocess.TimeoutExpired:
            return self.send_json(HTTPStatus.GATEWAY_TIMEOUT, {"error": "gh api did not answer in time"})

        status, headers, body = split_gh_response(run.stdout)
        if status is None:
            detail = run.stderr.strip() or run.stdout.strip() or "gh api printed no HTTP response"
            return self.send_json(HTTPStatus.BAD_GATEWAY, {"error": detail})

        forwarded = {name: headers[name.lower()] for name in FORWARDED_HEADERS if name.lower() in headers}
        if status == HTTPStatus.NOT_MODIFIED:
            return self.send_json(status, None, forwarded)
        if run.returncode != 0:
            detail = run.stderr.strip() or body.strip() or f"gh api exited with status {run.returncode}"
            return self.send_json(status, {"error": detail}, forwarded)
        return self.send_raw_json(status, body, forwarded)

    def send_json(self, status, payload, extra_headers=None):
        body = None if payload is None else json.dumps(payload)
        self.send_raw_json(status, body, extra_headers)

    def send_raw_json(self, status, body, extra_headers=None):
        data = b"" if body is None else body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if data:
            self.wfile.write(data)

    def log_request(self, code="-", size="-"):
        if code in (HTTPStatus.OK, HTTPStatus.NOT_MODIFIED, 200, 304):
            return
        super().log_request(code, size)


def main():
    parser = argparse.ArgumentParser(description="Serve the factory dashboard.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--repo", help="owner/name; found with `gh repo view` when omitted")
    args = parser.parse_args()

    if args.repo:
        if not REPO_PATTERN.fullmatch(args.repo):
            sys.exit(f"--repo must look like owner/name, got: {args.repo}")
        Handler.repo = args.repo
    else:
        Handler.repo = detect_repo()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Factory dashboard for {Handler.repo} at http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
