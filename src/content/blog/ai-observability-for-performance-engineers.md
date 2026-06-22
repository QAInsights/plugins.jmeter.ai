---
title: "AI Observability for Performance Engineers"
description: "Learn AI observability for performance engineers: TTFT, token metrics, OpenTelemetry GenAI conventions, and tools to monitor LLM systems in production."
pubDate: 2026-06-21T12:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/ai-observability-for-performance-engineers.png"
imageAlt: "AI observability for performance engineers featured image"
tags: ["AI Observability", "LLM", "OpenTelemetry", "Performance Testing", "JMeter"]
featured: true
---

# AI Observability for Performance Engineers

In this blog post, we will see what AI observability means for performance engineers, why it is fundamentally different from traditional APM, which metrics actually matter when you are testing LLM-backed systems, and the tools you need to get serious about it.

If you have spent years tuning JMeter scripts, chasing p99 latency spikes, and arguing about think time, you already have most of the mental model you need. AI observability just hands you a new set of instruments for a fundamentally different engine.

> **AEO Quick Answer:** AI observability for performance engineers is the practice of monitoring LLM-backed systems using metrics that traditional APM cannot capture. The metrics that matter are **Time to First Token (TTFT)**, **Tokens Per Second (TPS)**, **Time to Last Token (TTLT)**, **goodput**, and **token cost per request**. Instrument your AI applications with the **OpenTelemetry GenAI semantic conventions** (`gen_ai.*` attributes) so your traces work with any OTEL-aware backend without vendor lock-in. Popular tools include **Langfuse**, **Arize Phoenix**, **Helicone**, **Datadog AI Observability**, and **Weights and Biases Weave**. For load testing LLM APIs, use **JMeter** with varied prompts and a Backend Listener; for quick TTFT benchmarks across providers, use **iamspeed.dev**.

---

## What Is AI Observability?

AI observability is the practice of monitoring, tracing, and measuring AI systems, specifically LLM-backed applications, in production. It goes beyond knowing if your service is up. It asks: is the model behaving as intended? Is it slow? Is it expensive? Is it producing low-quality outputs?

Traditional observability answers "is my system healthy?" AI observability answers "is my AI doing the right thing, fast enough, at the right cost?"

The distinction matters because LLMs are non-deterministic and stateful in ways that regular services are not. The same prompt can produce different outputs. Token costs scale with input length. Streaming behavior changes the entire latency profile. You cannot observe these systems the same way you observe a Spring Boot endpoint.

---

## Why Performance Engineers Need to Pay Attention

Performance engineers are increasingly being handed AI-backed systems to test. Chat assistants, copilots, RAG pipelines, agentic workflows, these are now part of the stack. And someone needs to define SLAs for them.

Here is what I have seen in practice: teams build LLM features and instrument them with the same Datadog dashboards they use for REST APIs. They track HTTP response time. That is it. The result is a dashboard that tells you the API returned 200 OK in 800ms, but nothing about whether the model streamed tokens fast enough for a usable UX, or whether you paid for 4000 output tokens on a query that needed 200.

That gap is where AI observability lives.

---

## AI Metrics vs Traditional Metrics

Here is a side-by-side comparison so you can see exactly where the mental model shifts.

| Dimension | Traditional Systems | AI / LLM Systems |
|---|---|---|
| Latency | Response time (ms) | TTFT, TTLT, token streaming rate |
| Throughput | Requests per second | Tokens per second, queries per second |
| Error rate | HTTP 4xx/5xx | Model errors, rate limits, content filters, context overflows |
| Cost | Infrastructure cost | Token cost per request (input + output) |
| Quality | N/A | Hallucination rate, relevance score, faithfulness |
| Variance | Deterministic | Non-deterministic: same input, different latency |

The non-determinism row is the one that catches most performance engineers off guard. You cannot simply replay the same request and expect the same timing. Prompt complexity, model load, and KV cache state all influence response time in ways that are opaque.

---

## The Core LLM Metrics You Must Track

### 1. Time to First Token (TTFT)

TTFT is the elapsed time between sending a request and receiving the first token in the response. For streaming endpoints, this is the dominant UX metric. A low TTFT means the user sees the model "thinking" immediately. A high TTFT feels like lag even if total generation time is reasonable.

TTFT is influenced by prompt processing time, server load, and routing latency. It is roughly analogous to Time to First Byte (TTFB) in web performance.

Target: under 500ms for interactive use cases. Under 200ms for voice or real-time applications.

### 2. Tokens Per Second (TPS)

TPS measures how fast the model generates tokens after the first one appears. It reflects the throughput of the generation process itself. Low TPS produces a sluggish streaming experience even if TTFT is fast.

TPS varies significantly by model size and quantization. A 7B model running locally will produce a very different TPS curve than GPT-4o under load. This is your throughput metric for LLMs.

### 3. Time to Last Token (TTLT)

TTLT is total end-to-end latency, from request to the final token in the response. For non-streaming use cases this is your primary latency metric. For streaming, TTLT gives you the total response duration.

The relationship between TTFT and TTLT tells a story. A wide gap often means a long output. A narrow gap with a high TTFT suggests the bottleneck is server-side pre-processing, not generation.

### 4. Goodput

Goodput is the subset of total throughput that delivers successful, usable responses. If your system processes 100 requests per second but 20% hit rate limits, 5% exceed context length limits, and 3% return content filter blocks, your goodput is around 72 requests per second.

Goodput is the metric that actually reflects user-visible capacity. Track it separately from raw throughput.

### 5. Token Economics

Input tokens and output tokens are not equal in cost or in compute. Most LLM providers charge separately for prompt tokens and completion tokens. Under load, a high prompt-to-completion ratio means you are paying heavily for processing, not for generation.

Track:
- Average input tokens per request
- Average output tokens per request
- Token cost per request (input cost + output cost)
- Cost per successful session

These metrics connect engineering decisions, like prompt length and output truncation, directly to infrastructure spend.

### 6. Context Window Utilization

Modern LLMs support context windows from 8K to 1M+ tokens. RAG pipelines and agentic systems routinely fill 60-80% of this window. Context utilization affects both latency and cost. Tracking average context fill percentage helps you spot runaway retrievers and poorly scoped agents before they hit production.

---

## The Three Pillars Reimagined for AI

### Logs

In AI systems, logs need to capture the full prompt and completion (or a hashed version for privacy), model parameters (temperature, max tokens, top-p), finish reason (stop, length, content_filter, tool_call), and any retrieval context in RAG pipelines.

The finish reason is underrated. If 30% of your completions finish with `length` instead of `stop`, your max_tokens limit is cutting off responses. That is a correctness bug disguised as normal behavior.

### Metrics

Beyond TTFT/TPS/TTLT, expose these as time-series metrics:

- Token count histograms by request type
- Error rate segmented by error category (rate_limit, context_length, content_filter, server_error)
- Queue depth if you are running a batching proxy
- Cache hit rate if you are using semantic caching

### Traces

Distributed tracing becomes essential in multi-step AI applications. A single user query in a RAG pipeline might touch an embedding model, a vector database, a reranker, and the LLM itself. Without traces, you cannot tell which step is causing latency.

OpenTelemetry spans should capture each step with parent-child relationships so you can see the full call tree. I cannot stress this enough for agentic systems where the LLM might make three tool calls before responding.

---

## OpenTelemetry GenAI Semantic Conventions

The OpenTelemetry project has published official semantic conventions for generative AI systems. These are the standardized attribute names you should instrument your AI applications with.

Key attributes from the GenAI spec:

```
gen_ai.system            The AI provider (openai, anthropic, cohere, etc.)
gen_ai.request.model     Model requested (gpt-4o, claude-3-5-sonnet, etc.)
gen_ai.response.model    Model actually used (may differ in routing setups)
gen_ai.usage.input_tokens    Number of prompt tokens consumed
gen_ai.usage.output_tokens   Number of completion tokens generated
gen_ai.response.finish_reasons  Array of finish reasons
gen_ai.request.temperature   Temperature setting used
gen_ai.request.max_tokens    Max tokens limit set
```

Using these standard attributes means your AI spans will be compatible with any OTEL-aware backend: Grafana, Honeycomb, Datadog, Jaeger, without vendor lock-in.

The GenAI conventions are versioned and actively maintained. Head to [opentelemetry.io/docs/specs/semconv/gen-ai/](https://opentelemetry.io/docs/specs/semconv/gen-ai/) to read the current spec before you start instrumenting.

Example span with GenAI attributes (as shown below in a Jaeger trace) gives you instant visibility into which model, which cost, and which finish reason each request produced.

---

## Popular AI Observability Tools

Here are the tools that have gained real adoption. I am keeping this grounded, no vaporware.

### Langfuse

Langfuse is an open-source LLM observability platform. It captures traces, evaluations, and session data. It integrates directly with LangChain, LlamaIndex, and OpenAI SDKs via a simple wrapper. You can self-host it with Docker or use the cloud version.

What makes Langfuse stand out is the evaluation workflow: you can score responses manually or run automated evaluators and see the scores alongside latency and cost data in the same view.

Head to [langfuse.com](https://langfuse.com) to get started.

### Arize Phoenix

Phoenix by Arize AI is an open-source AI observability tool built on OpenTelemetry. It gives you traces, span-level metrics, and a built-in UI for inspecting prompt/completion pairs. Phoenix integrates well with Python LLM stacks and is particularly useful for RAG pipeline debugging.

Head to [phoenix.arize.com](https://phoenix.arize.com) to explore.

### Helicone

Helicone is a proxy-based LLM observability platform. You route your OpenAI (or compatible) API calls through Helicone and it automatically captures TTFT, latency, token usage, and cost, with zero SDK changes. It supports caching and rate limiting as well.

The proxy model is appealing when you cannot or do not want to instrument your application code.

### Datadog AI Observability

Datadog added dedicated AI Observability features with LLM-specific dashboards, token cost tracking, and prompt/response logging. If you are already running Datadog APM, this is the path of least resistance: your AI spans show up alongside your regular service traces.

### Weights and Biases Weave

Weave is W&B's LLM observability product built on top of their existing experiment tracking infrastructure. It is especially useful for teams that are also running fine-tuning or evaluation pipelines, since you can correlate production traces with model training experiments in one place.

---

## Testing LLM APIs with JMeter

JMeter remains one of the most capable tools for load testing LLM APIs at scale. HTTP endpoints from OpenAI, Anthropic, Google Gemini, and self-hosted models like Ollama are all reachable with the standard HTTP Sampler.

For **streaming endpoints**, you need to handle Server-Sent Events (SSE). JMeter's built-in HTTP sampler buffers the full response, so TTFT is not natively captured. You can work around this by:

1. Using the WebSocket plugin for SSE-capable connections
2. Writing a custom JSR223 Sampler in Groovy that reads the SSE stream and extracts the timestamp of the first `data:` chunk
3. Using the Java HTTP client in a BeanShell/Groovy sampler with a response streaming flag

For **non-streaming endpoints**, a standard HTTP POST with a JSON body works perfectly. Add these as custom metrics via Backend Listener to your Graphite or InfluxDB instance for real-time dashboards.

A good JMeter AI API test plan includes:

- A CSV Data Set Config with varied prompts (do not use the same prompt: it will hit the KV cache and give you unrealistically fast results)
- An HTTP Header Manager with Authorization and Content-Type
- A JSON Extractor for response body fields
- A Response Assertion on HTTP status code
- A Backend Listener to stream results to your APM dashboard

If you are building or extending your JMeter setup, head to [jmeter.ai](https://jmeter.ai) to explore PerfAtlas, a curated directory of JMeter plugins. It is the fastest way to discover plugins for custom samplers, listeners, functions, and more without digging through forums. I built PerfAtlas specifically so you do not waste time hunting down that one plugin that solves your exact problem.

---

## Benchmark TTFT with iamspeed.dev

If you want to measure TTFT across different LLM providers without building a full test harness, head to [iamspeed.dev](https://iamspeed.dev).

iamspeed.dev is an LLM streaming benchmarker that measures Time to First Token and tokens per second across providers in real time. You can compare how Anthropic Claude, OpenAI GPT models, and others perform under identical conditions.

For performance engineers evaluating which provider or model to use in production, this gives you a fast, reproducible baseline without spinning up a JMeter cluster. Think of it as a smoke test for your LLM choice before you commit to a full load test.

I built iamspeed.dev because I could not find a clean, open tool that measured TTFT directly in the browser with real streaming output. Most benchmarks I found were batch latency measurements, which miss the streaming UX entirely.

---

## Discover AI Tools with ai.dosa.dev

The AI tooling ecosystem is moving fast. New observability tools, tracing libraries, and LLM gateways are launching every week.

Head to [ai.dosa.dev](https://ai.dosa.dev) to browse a curated, community-voted directory of AI tools, including observability platforms, testing utilities, prompt management tools, and more. The voting system surfaces what practitioners are actually using, not what marketing teams are pushing.

It is a useful reference when you are evaluating alternatives to the tools listed in this post, or when you want to see what the community is gravitating toward right now.

---

## Where to Start

If you are a performance engineer new to AI observability, here is a practical starting sequence:

1. **Identify your AI entry points.** Map every endpoint in your system that calls an LLM. These are your observation targets.
2. **Add OpenTelemetry instrumentation** using the GenAI semantic conventions. Use an existing SDK wrapper (openai-python, anthropic-sdk) with an OTEL exporter. The SDKs support auto-instrumentation.
3. **Start capturing TTFT.** Even a simple timestamp delta in your request code gives you something to baseline. Use iamspeed.dev to calibrate expectations per provider.
4. **Track token usage per request.** Pull input and output token counts from the API response. Log them.
5. **Add a dedicated AI dashboard** in Grafana or Datadog. Separate from your service dashboards. Include TTFT, TPS, goodput, token cost, and finish reason distribution.
6. **Run a load test** with JMeter using varied prompts and realistic concurrency. 10 virtual users hitting an LLM API is enough to see how TTFT degrades under contention.
7. **Set alerts** on TTFT p95, error rate by category, and token cost spikes. These are your production guardrails.

The core insight here is that you already know how to do this. TTFT is your TTFB. TPS is your throughput. Goodput is your effective RPS. Token cost is your resource utilization. The instruments are new but the engineering discipline is the same.

AI systems need performance engineers more than ever, because they are expensive, non-deterministic, and critical to user experience in ways that traditional services rarely are.

Happy Testing!

---

**What is your biggest challenge when performance testing LLM-backed systems? Are you struggling with streaming metrics, cost attribution, or something else entirely? Drop it in the comments: I would love to tackle it in a follow-up post.**
