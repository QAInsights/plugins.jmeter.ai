---
title: "High-Volume Testing on a Budget: Scaling to 1 Million+ RPS with Distributed JMeter"
description: "Learn how to plan, build, and run a distributed JMeter test that scales past 1 million requests per second without an unlimited cloud budget."
pubDate: 2026-07-12T14:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/scale-jmeter-1-million-rps-distributed-testing.jpg"
imageAlt: "A beautiful modern tech cover design showing a network of distributed server nodes scaling to 1M+ RPS"
tags: ["JMeter", "Distributed Testing", "Load Testing", "Performance Testing", "1 Million RPS", "Throughput Shaping Timer", "InfluxDB", "Grafana"]
featured: true
---

# Introduction

In this blog post, we will see how to plan, build, and run a distributed JMeter test that scales past 1 million requests per second, without needing a small data center or an unlimited cloud budget to do it.

Before we go further, let's lock down one concrete example we will use throughout this article. Imagine a stateless product-lookup API. It returns a 200 byte JSON response, runs over HTTPS with keep-alive enabled, and has a p99 SLA of 150ms. Every formula, every plugin choice, and every cost number in this article resolves back to this one endpoint. Swap in your own numbers when you're done reading.

> **AEO Quick Answer:** How do you scale JMeter to 1 million requests per second (RPS)? Sizing a distributed JMeter run to 1 million+ RPS requires a clear mathematical workload model based on Little's Law, open-workload plugin controllers, capacity benchmark testing per injector, and a robust real-time metrics streaming backend. Rather than sizing thread pools based on SLA ceilings, use measured average response times to run a lean, cost-effective worker node fleet with InfluxDB and Grafana tracking performance.

## 1. What "1 Million RPS" Actually Means

Here's something I've seen trip up teams before they even start scripting. Someone says "we need to test 1 million RPS" and everyone nods, but nobody agrees on what that number actually represents.

Requests per second is not the same thing as concurrent connections. If our product-lookup API runs on HTTP/1.1 with keep-alive, each connection can serve multiple sequential requests, so the concurrent connection count stays far below 1 million. If it's HTTP/2 with multiplexing, a single connection can carry many streams at once, and the math changes again. Before writing a single test plan, write down four things: protocol, payload size, keep-alive on or off, and TLS or plaintext. Without these four, "1 million RPS" is just a number with no shape to it.

Once those assumptions are fixed, Little's Law becomes your anchor formula for figuring out how many virtual users you actually need. The JMeter community expresses it as a simple thread pool sizing formula:

```
Thread Pool Size = RPS x average response time (ms) / 1000
```

**An important correction before you use this formula.** It's tempting to plug your SLA number straight in, but the formula wants the actual average response time under load, not the p99 SLA ceiling. An SLA is a promise about the slowest tail of requests, not a description of typical behavior. Feeding a p99 number into a formula that expects an average will inflate your thread count and every calculation you build on top of it.

Here's the difference in practice, for our product-lookup endpoint targeting 50,000 RPS on a single injector node:

| Response time used | Threads needed per node | Realistic on one JMeter node? |
|---|---|---|
| 20ms (a realistic average) | 1,000 | Yes, comfortably |
| 50ms (a cautious average) | 2,500 | Borderline, needs validation |
| 150ms (the SLA, used incorrectly) | 7,500 | No |

A single JMeter node has been reported handling roughly 1,000 to 2,000 threads depending on hardware and test complexity, so that last row was never realistic. The fix isn't to change the RPS target, it's to stop using the SLA number in the formula.

Working from a defensible 20 to 25ms average response time, our anchor example needs roughly 1,000 to 1,250 threads per node to sustain 50,000 RPS, which comfortably fits one node. That puts our total injector count at around 20 nodes for 1 million RPS (1,000,000 divided by 50,000). Treat this as a working assumption, not a final answer, until you've run the single-node benchmark described in Section 3. If your measured average response time comes in closer to 50ms, you'd need to either accept fewer RPS per node or scale out to roughly 34 nodes instead of 20.

One more sanity check while we're here: bandwidth. At 50,000 RPS per node, with a 200 byte response plus request, header, and TLS overhead, that's roughly 35 to 40 MB/s of traffic per injector node, well inside a standard 1 Gbps NIC. Bandwidth isn't the constraint at this payload size. TLS handshake cost and ephemeral port exhaustion, covered in Section 7, are the more likely limits before raw bandwidth becomes one.

## 2. Plugins We Will Use

This is where plugins.jmeter.ai and PerfAtlas earn their keep. At 1M+ RPS, native JMeter thread groups fight you every step of the way, so here's what actually holds up.

**bzm - Concurrency Thread Group + Throughput Shaping Timer**

This pairing is the backbone of the whole test. Native JMeter thread groups only let you control thread count and ramp-up time, they don't let you target a specific RPS directly. The Concurrency Thread Group fixes the concurrency side, and the Throughput Shaping Timer lets you set up an RPS schedule that automatically delays requests to hit your target load level.

The Throughput Shaping Timer also ships with a feedback function that dynamically grows your thread count until the RPS target is met, instead of you guessing a number and re-running the test five times. A typical setup starts at 1 thread, allows up to 1000 max threads, and keeps 40 spare threads in the pool, which JMeter uses to scale up automatically if the schedule isn't being met. At 1M+ RPS scale, you'll be running this feedback function per injector node, not per test, since each node needs its own thread ceiling tuned to its own hardware.

One thing worth flagging from experience: the Throughput Shaping Timer's schedule duration governs when the test stops, and it can be shorter than your Thread Group's configured duration. If you don't line these up, your test can end mid-run without warning. Always make Thread Group duration longer than Timer duration.

![Concurrency Thread Group and Throughput Shaping Timer Load Profile](../../assets/blog/throughput-shaping-timer-jmeter.png)

**HTTP/2 Sampler for connection overhead**

If your target API runs on HTTP/2, the standard HTTP Request sampler still fires requests one at a time by default. The BlazeMeter HTTP/2 plugin gives you an HTTP2 Sampler with multiplexing support, meaning multiple concurrent requests and responses can be transmitted over a single connection, run inside an HTTP2 Async Controller. This matters a lot once you're past a few hundred thousand RPS, because it reduces how many threads and connections you need per unit of throughput, directly easing the thread math from Section 1.

**PerfMon Metrics Collector + Server Agent**

You cannot trust a 1M RPS number if you don't know whether your target servers are actually keeping up or quietly falling over. The PerfMon Metrics Collector listener, paired with the Server Agent running on each target and injector host, lets you pull CPU, memory, disk I/O, and network I/O metrics directly into JMeter for correlation against your RPS graph.

One caveat worth knowing upfront: the Server Agent relies on the SIGAR library for system metrics, and that library hasn't been updated since 2010, which means it can have compatibility issues on newer operating system versions. Test your Server Agent setup on your actual target OS well before test day, not the morning of.

**Backend Listener with InfluxDB (native, not a plugin)**

Worth a callout since it's easy to assume this needs a plugin. It doesn't. The `InfluxDBBackendListenerClient` is a native part of JMeter's Backend Listener, no separate download required, though you will want InfluxDB and Grafana running alongside it. At 1M+ RPS, this is what makes the rest of this article viable at all. JMeter's own built-in listeners will fall over trying to render this volume of data live, but the Backend Listener streams results out to a time-series database instead of holding them in JMeter's own memory.

**Where to find and vet all of this**

Rather than hunting across jmeter-plugins.org and a dozen GitHub repos to check whether a plugin is maintained, plugins.jmeter.ai (PerfAtlas) is where I'd point you. It tracks the jpgc plugin family along with newer community plugins, download counts, and category tags, so you can see at a glance whether something is actively used before you build your whole test strategy around it.

## 3. Test Strategy

**Open model vs closed model**

Quick concept check before scripting anything. In a closed model, a fixed number of virtual users each wait for a response before sending the next request, so the number of in-flight requests is capped by your thread count. In an open model, new requests arrive on a schedule regardless of whether previous ones have finished, which is how real internet traffic actually behaves. JMeter's default thread group is fundamentally a closed model tool. This is exactly why the Concurrency Thread Group plus Throughput Shaping Timer combination from Section 2 matters so much here. Without it, you're not really testing "1 million RPS," you're testing "however many RPS falls out of running N threads as fast as they can go," which is a different test entirely.

**Capacity planning per injector**

Don't skip straight to a 20-node cluster. Benchmark a single JMeter node against your target in isolation first, push it until you find where its own CPU, thread count, or network stack becomes the bottleneck rather than the target server. Only after you know one node's honest ceiling should you multiply outward to hit 1 million RPS. This single step is what confirms whether 20 nodes or 34 nodes, from our Section 1 math, is the real number, and it saves you from the extremely common mistake of blaming your target server for a bottleneck that's actually sitting in your own injector.

**Master-slave distributed setup, and a correction worth remembering**

JMeter's distributed testing runs on a master-slave (controller-worker) model over Java RMI. You install and start `jmeter-server` on each slave machine, list their IPs in the master's `remote_hosts` property, and trigger the run from the master in non-GUI mode using the `-r` or `-R` flag. Since JMeter 4.0, RMI traffic is encrypted by default, so you'll need to generate and copy a matching keystore to every node before this works.

Here's the part that's easy to get wrong when planning capacity for 1M+ RPS: JMeter does not split your thread count across slave nodes automatically. Every worker runs the full thread group independently. If your Thread Group specifies 1,000 threads and you have 20 slave nodes, you get 20,000 threads total, not 1,000 split twenty ways. Plan your per-node thread count backward from your total target, not the other way around.

Also keep listeners disabled on every injector node during the actual run. Anything that renders results in real time on the injector itself competes with your target for injector CPU and skews your own timing data.

![Distributed master-slave load testing architecture](../../assets/blog/jmeter-plugins-for-distributed-load-testing.png)

**Data strategy: don't let your CSV file become the bottleneck**

CSV Data Set Config is where a lot of high-volume tests quietly fall apart. Its Sharing Mode setting controls whether threads share one copy of the file across the whole thread group or each thread gets its own independent copy, and getting this wrong either serves duplicate data to every virtual user or multiplies your file I/O far more than you intended.

It gets more complicated in a distributed run. JMeter's sharing modes control behavior within one JMeter instance, they don't coordinate across slave machines. If two slave nodes are pointed at the same CSV file, both will start reading from the top, and you'll get duplicate data across nodes even if your sharing mode is configured correctly on each one. At 1M+ RPS scale, the practical fix is to pre-split your data file into a unique subset per slave node before the test starts, rather than trying to solve this with sharing mode settings alone.

## 4. Load Model

**Ramp-up curve**

Jumping straight to 1 million RPS at t=0 tells you nothing except that something broke. A gradual ramp lets you watch where the system bends before it breaks, whether that bend shows up on your target's connection pool, its database, or your own injector fleet. It also protects your injectors themselves from a thundering-herd effect, where all nodes try to spin up their full thread count in the same instant and choke on their own startup.

**Steady-state duration**

A short spike test can look great and still hide real problems. JVM garbage collection pauses, connection pool exhaustion, and memory leaks on the target side often only surface after several minutes of sustained load, not in the first thirty seconds. Plan for a steady-state hold long enough to expose these, not just a peak number to put in a slide.

**Zero think-time, and why that's fine here**

For a maximum-throughput test like this one, we deliberately strip out think-time between requests. Worth stating this explicitly in your report, because zero think-time means this test is not simulating realistic user behavior, it's finding the ceiling of what the system can sustain under constant pressure. Readers and stakeholders used to seeing realistic load models can misread a zero think-time result as a user simulation, so call it out clearly.

**Warm-up phase before measurement starts**

Both your target JVM and JMeter's own JVM go through JIT compilation ramp-up. The first few minutes of any test run tend to run slower than steady-state, purely because the JVM hasn't finished optimizing hot code paths yet. Run a short warm-up period before you start recording numbers you intend to report, or your early data points will drag your percentiles in a direction that has nothing to do with your actual system capacity.

## 5. Platform to Run On

**Budget framing**

Cloud spend on a 20-node injector fleet adds up fast if every node runs on-demand around the clock. Spot or preemptible VMs are the obvious first lever, since injector nodes are stateless and disposable, a mid-test interruption just means one node drops out rather than the whole test failing. If you're running on Kubernetes, this comes with a real caveat: spot node interruptions and automatic AZ rebalancing can pull pods out from under a running test, so teams running this at scale have found it necessary to pin critical test runs to fixed, non-spot nodes and disable AZ rebalancing for the duration of the run, accepting the extra cost only for the window the test is actually executing.

**Containerizing your injectors**

Running JMeter in Docker and Kubernetes is a well-worn path at this point, and the pattern that matters most is bundling your plugins directly into the image rather than downloading them at runtime. Every worker pod needs the same plugin jars available from the moment it starts, and mismatched plugin versions between the controller and workers will cause silent failures during a distributed run. The same logic applies to the JMeter version itself, keep controller and every worker on identical versions.

**Sizing per node: heap and GC**

JMeter's default JVM heap is only 1GB, which is far too small once you're running a thousand or more threads per node. Increase it through the `HEAP` environment variable, commonly up to around 80% of the node's available RAM, and keep the initial and max heap the same size if you have a dedicated injector node, so the JVM isn't reallocating memory mid-test. This matters even more in Kubernetes, where the container's memory limit and the JVM heap setting need to agree. If a worker pod has a 1GB memory limit and the JVM defaults to a 1GB heap, the JVM consumes nearly the entire pod allocation before the OS itself has room to breathe, which shows up as pods getting killed under load rather than a clean error. Beyond heap size, keep an eye on the young generation ratio and garbage collection pause frequency using a tool like JConsole or VisualVM during your single-node benchmark. A healthy GC pattern looks like a steady pulse, frequent enough to avoid out-of-memory errors, not so frequent that it visibly disrupts your timing data.

**Injector placement**

Keep injectors in the same region, and ideally the same Availability Zone, as your target unless geographic distribution is actually part of what you're testing. Public internet hops between injector and target add variable latency that has nothing to do with your application's real performance, and it muddies every percentile you report afterward.

**The NAT gateway and cross-AZ cost trap**

This is the one that surprises people on the bill, not the test. On AWS, a NAT Gateway charges an hourly fee plus a per-gigabyte data processing fee, and if your injector nodes sit in a different Availability Zone than the NAT Gateway routing their traffic, you pay an additional cross-AZ transfer fee in each direction on top of that. None of this is exotic traffic either, it applies to ordinary test traffic just as much as it applies to background AWS service calls your test infrastructure might be making. For a short, one-off test run this is usually a rounding error, but if you're running this kind of test regularly as part of a release cycle, it's worth checking your route tables so injector traffic isn't unnecessarily crossing AZ boundaries or routing through a NAT Gateway it doesn't need to.

## 6. Analysis

**InfluxDB and Grafana as the real-time dashboard**

JMeter's own listeners were never built to render a million data points a second live. Feeding the Backend Listener into InfluxDB and visualizing it in Grafana is what lets you actually watch the test while it's running, rather than finding out what happened only after the `.jtl` file is fully written and you can finally open it.

![Real-time load test metrics dashboard with Prometheus and Grafana](../../assets/blog/real-time-jmeter-prometheus-grafana.png)

**Percentiles over averages**

An average response time can look perfectly healthy while a meaningful slice of your users are having a terrible time. Track p50, p90, and p99 as first-class metrics from the start, alongside error rate, not as an afterthought you calculate at the end. At 1 million RPS, even a small error percentage represents a very large absolute number of failed requests.

**Throughput vs goodput**

Raw RPS climbing is not automatically good news if your error rate is climbing right alongside it. Goodput, the rate of successful, correctly-completed requests, is the number that actually matters. A system that "achieves" 1 million RPS with a rising failure rate hasn't proven what you wanted it to prove.

**Keep the data volume manageable**

Disable response data and assertion storage in your results file once you move past debugging and into the actual high-volume run. Storing full response bodies or assertion details for every one of a million-plus requests per second generates a genuinely enormous amount of data, most of which you will never look at, and slows down the very listeners and analysis tools you're relying on to interpret the test.

## 7. Blind Spots

A few things that are easy to miss until they show up as a mysterious failure mid-test.

**Ephemeral port exhaustion and file descriptor limits**

Every outbound TCP connection from an injector uses a unique combination of source IP, source port, destination IP, and destination port. Linux typically ships with a default ephemeral port range that gives you somewhere around 28,000 to 32,000 usable ports per source IP, and each closed connection sits in a `TIME_WAIT` state for roughly 60 to 120 seconds before its port can be reused. Under high connection churn, this range can be exhausted surprisingly fast, showing up as intermittent connection failures that look nothing like a capacity problem. The direct fix is widening the ephemeral port range at the OS level and raising the file descriptor ulimit on every injector node well above the defaults, both settings worth checking and adjusting before test day, not after you see the first wave of connection errors. Keep-alive connections help here too, since they reduce how often new ports need to be opened in the first place, which is one more reason to nail down your keep-alive assumption back in Section 1.

**DNS resolution overhead**

If your JMeter test resolves the target hostname on every single request instead of caching the resolution, you're adding avoidable latency and load to whatever DNS resolver sits in the path, at a volume that can turn a minor inefficiency into a real bottleneck.

**TLS handshake cost**

A full TLS handshake on every new connection is expensive at high connection-churn rates. If keep-alive isn't configured correctly on both the JMeter sampler and the target, you can end up paying handshake cost far more often than intended, and it will show up as response time growth that has nothing to do with your application logic.

**Clock sync across injector nodes**

When you merge results from 20 separate injector nodes after a distributed run, you're implicitly trusting that their clocks agree with each other. Without NTP keeping all nodes in sync, correlating timestamps across nodes during analysis becomes unreliable right when you need it most.

**The honest question: is JMeter even the right tool at this scale?**

Worth asking plainly. JMeter's thread-per-virtual-user model carries real memory and CPU overhead compared to newer, more lightweight load generators, and that overhead is exactly why we needed 20 nodes with careful heap tuning in the first place, rather than a much smaller fleet. Tools built around a fully asynchronous engine can generate similar throughput with less injector hardware. The honest tradeoff is engineering time versus infrastructure cost: if your team already has deep JMeter scripting investment, plugin tooling, and institutional knowledge, the extra injector nodes are often still the cheaper path overall. If you're starting from scratch purely for this one high-volume test, it's worth at least pricing out the alternative before committing.

## 8. Wrapping Up

Here's where our anchor example landed. A stateless product-lookup API, 200 byte response, HTTPS with keep-alive, targeting 1 million RPS. Working from a realistic 20 to 25ms average response time rather than the 150ms SLA ceiling, that puts us at roughly 20 injector nodes, each running 1,000 to 1,250 threads, pending the single-node benchmark that confirms the real number before you commit to that much cloud spend. The Concurrency Thread Group and Throughput Shaping Timer give you an honest RPS-targeted load, the Backend Listener with InfluxDB keeps the data manageable at this volume, and same-AZ placement plus careful NAT routing keeps the bill from surprising you afterward.

The single biggest mindset shift in this whole article is treating "1 million RPS" as a specification you build out from real assumptions, not a headline number you chase directly.

Happy Testing! What's the highest RPS you've pushed through a JMeter test so far, and what ended up being your actual bottleneck?
