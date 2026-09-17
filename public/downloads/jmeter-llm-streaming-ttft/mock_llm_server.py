#!/usr/bin/env python3
"""Mock OpenAI-compatible LLM server (stdlib only).

Endpoints:
  GET  /v1/models            -> model list containing gpt-4o
  POST /v1/chat/completions  -> SSE stream (stream=true) or plain JSON (stream=false)

Latency model:
  - "prefill" delay: random 250-600 ms + 5 ms per in-flight request (TTFT degrades under load)
  - ~40-120 token chunks, each after a random 15-40 ms "decode" sleep
"""
import json
import random
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "127.0.0.1", 8000

WORD_POOL = (
    "Performance testing validates system behavior under expected and peak load. "
    "Latency percentiles like p95 matter more than averages because tail latency "
    "defines the user experience. Throughput saturation reveals bottlenecks in "
    "connection pools thread scheduling and downstream dependencies. Always warm "
    "up the JVM before measuring and correlate client metrics with server side "
    "telemetry to avoid misleading conclusions about capacity and scalability."
).split()

ANSWER = (
    "Great question. When load-testing a system, focus on three signals: latency "
    "percentiles (p50/p95/p99), throughput, and error rate. Averages hide tail "
    "behavior, so a service can look healthy while 5% of users suffer. Ramp load "
    "gradually, hold steady-state long enough for JIT warm-up and connection pool "
    "stabilization, and always correlate client-side metrics with server telemetry "
    "such as CPU, GC pauses, and queue depth. For streaming APIs specifically, "
    "time-to-first-token and inter-token latency are the metrics that actually "
    "shape perceived responsiveness."
)


TTFT_ANSWER = (
    "This JSR223 sampler measures three LLM-specific metrics for the streaming "
    "/v1/chat/completions call. TTFT (Time to First Token) is the gap between "
    "tSent and the first SSE data: line; the script calls SampleResult.latencyEnd() "
    "at that moment, so JMeter's Latency column becomes TTFT. Token throughput is "
    "tokens divided by the generation window (first token to last token), stored in "
    "tokens_per_sec. ITL p50 is the median gap between consecutive chunks. A few "
    "suggestions: 1) Raise the read timeout above 60 s if you test long completions. "
    "2) Add a JSR223 Assertion that fails the sample when ttft_ms exceeds your SLO, "
    "for example 1000 ms, so goodput shows up as error rate. 3) Keep sample_variables "
    "in user.properties so ttft_ms and tokens_per_sec land in the JTL for the HTML "
    "report. 4) Reuse the HttpURLConnection keep-alive pool or switch to Apache "
    "HttpClient if you scale beyond a few hundred concurrent streams."
)


def build_answer(user_prompt):
    """Pick a canned answer; TTFT-related prompts get a context-specific reply."""
    p = (user_prompt or "").lower()
    if any(k in p for k in ("ttft", "first token", "streaming", "jsr223", "tokens")):
        return TTFT_ANSWER
    return ANSWER


class State:
    def __init__(self):
        self.inflight = 0
        self.lock = threading.Lock()


STATE = State()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # quiet; uncomment for debugging

    def _json(self, obj, status=200, extra_headers=None):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()

    def do_GET(self):
        if self.path.rstrip("/") in ("/v1/models", "/v1/models/"):
            self._json({
                "object": "list",
                "data": [
                    {"id": "gpt-4o", "object": "model",
                     "created": 1715367049, "owned_by": "mock"}
                ],
            })
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self._json({"error": "not found"}, 404)
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            self._json({"error": "bad json"}, 400)
            return

        model = req.get("model", "gpt-4o")
        stream = bool(req.get("stream"))
        messages = req.get("messages", [])
        prompt = " ".join(str(m.get("content", "")) for m in messages)

        with STATE.lock:
            STATE.inflight += 1
            inflight = STATE.inflight
        try:
            if stream:
                self._stream(model, inflight, prompt)
            else:
                self._nonstream(model, prompt)
        finally:
            with STATE.lock:
                STATE.inflight -= 1

    def _prefill_sleep(self, inflight):
        time.sleep(random.uniform(0.25, 0.60) + 0.005 * inflight)

    def _stream(self, model, inflight, prompt=""):
        chunk_id = "chatcmpl-" + uuid.uuid4().hex[:24]
        created = int(time.time())
        words = None
        if len(prompt) > 400:  # Feather Wand sends the element XML as context
            words = build_answer(prompt).split()
        n_tokens = len(words) if words else random.randint(40, 120)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        # no Content-Length / Transfer-Encoding: chunked -> body ends on close
        self.end_headers()
        self.close_connection = True

        self._prefill_sleep(inflight)

        for i in range(n_tokens):
            word = (words[i] if words else WORD_POOL[i % len(WORD_POOL)]) + " "
            chunk = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {"content": word},
                    "finish_reason": None,
                }],
            }
            if i == 0:
                chunk["choices"][0]["delta"] = {"role": "assistant", "content": word}
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.flush()
            time.sleep(random.uniform(0.015, 0.040))

        final = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
        self.wfile.write(f"data: {json.dumps(final)}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def _nonstream(self, model, prompt):
        self._prefill_sleep(1)
        content = build_answer(prompt)
        completion_tokens = len(re.findall(r"\S+", content))
        prompt_tokens = len(re.findall(r"\S+", prompt)) if prompt else 0
        self._json({
            "id": "chatcmpl-" + uuid.uuid4().hex[:24],
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        })


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Mock LLM server on http://{HOST}:{PORT}/v1", flush=True)
    server.serve_forever()
