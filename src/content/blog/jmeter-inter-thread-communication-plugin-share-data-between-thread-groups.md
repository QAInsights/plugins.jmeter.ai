---
title: "JMeter Inter-Thread Communication Plugin: How to Share Data Between Thread Groups"
description: "Learn how the JMeter Inter-Thread Communication plugin shares data between thread groups via FIFO queues, __fifoPut/__fifoPop functions, timeouts, and pitfalls."
pubDate: 2026-09-14T12:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/jmeter-inter-thread-communication-plugin-share-data-between-thread-groups.png"
imageAlt: "Featured image for JMeter Inter-Thread Communication Plugin: How to Share Data Between Thread Groups"
tags: ["JMeter", "JMeter Plugins", "Inter-Thread Communication", "FIFO Queue", "Thread Groups", "Load Testing", "Performance Testing"]
featured: false
draft: false
---

# JMeter Inter-Thread Communication Plugin: How to Share Data Between Thread Groups

In this blog post, we will see how the JMeter Inter-Thread Communication plugin lets one thread hand
data to another thread, even across thread groups, using named FIFO queues. If you have ever tried
to make a "producer" thread group create orders and a "consumer" thread group process them, you
already know that plain JMeter variables do not help here. Variables are local to a thread. What one
thread extracts, another thread cannot see.

The usual workaround is to write to a CSV file in one thread group and read it in another, or to use
`__setProperty` and `__P` and hope the timing works out. Both approaches are fragile. The
Inter-Thread Communication plugin, or ITC, from jmeter-plugins.org solves this cleanly with a
thread-safe, in-memory queue. It is one of the most downloaded jp@gc plugins on PerfAtlas, sitting
above 12,000 installs, and yet I rarely see it in real test plans. Let's fix that.

## 1. What is the Inter-Thread Communication plugin?

The [Inter-Thread Communication](/plugin/jpgc-fifo/) plugin (`jpgc-fifo` in the Plugins Manager)
provides global string queues that work in First-In-First-Out order. One thread puts a string into a
queue, another thread takes it out. The two threads can live in the same thread group or in
completely different thread groups, and the queue does not care.

There can be any number of queues. Each one is identified by its queue name, so you can run a
`order_ids` queue and a `session_tokens` queue side by side without them interfering.

The plugin ships two flavors of the same idea:

- A **PreProcessor** and a **PostProcessor**, which you attach as children of samplers
- Four **functions**: `__fifoPut`, `__fifoPop`, `__fifoGet`, and `__fifoSize`, which you can call
  from anywhere JMeter evaluates a function

Under the hood, both flavors talk to the same set of queues, so you can mix them. A PostProcessor
can put data that a `__fifoPop` function later reads.

The official documentation lives on the
[jmeter-plugins.org wiki](https://jmeter-plugins.org/wiki/InterThreadCommunication/), and it is
short enough to read in five minutes, which I recommend before you build anything on top of it.

## 2. Why JMeter variables and properties are not enough

Before the how-to, it helps to understand why the plugin exists.

| Mechanism                   | Scope           | Thread-safe handoff? | Blocks until data arrives? |
| :-------------------------- | :-------------- | :------------------- | :------------------------- |
| JMeter variables (`${var}`) | Single thread   | No                   | No                         |
| JMeter properties (`__P`)   | Whole JVM       | Not for lists        | No                         |
| CSV Data Set Config         | Read-only input | Yes, for reading     | No                         |
| Inter-Thread Communication  | Whole JVM       | Yes                  | Yes, with optional timeout |

Properties are shared across the JVM, so people often try to pass data with `__setProperty`. That
works for exactly one value. The moment you have 50 producer threads each generating an ID, they
overwrite the same property and consumers read whatever was written last. There is also no way for a
consumer to wait until a value is available.

The FIFO queue gives you both missing pieces: every produced value is kept in order, and a consumer
can block until something shows up.

## 3. Installing the plugin

Install it through the Plugins Manager by searching for "Inter-Thread Communication". If you have
not set that up yet, follow the
[How to install JMeter Plugins Manager](/blog/how-to-install-jmeter-plugins-manger/) post first.

For headless or containerized setups, the plugin ID is `jpgc-fifo`:

```bash
PluginsManagerCMD.sh install jpgc-fifo
```

The plugin is small. Version 0.2 pulls in only one extra library, `jmeter-plugins-cmn-jmeter`, and
declares compatibility back to JMeter 2.13, so it works on anything you are realistically running
today. If you bake plugins into a Docker image, the
[PluginsManagerCMD in Docker](/blog/jmeter-plugin-install-automation-pluginsmanagercmd-docker/)
guide covers the pattern.

After installation you will find two new elements in the GUI:

- `jp@gc - Inter-Thread Communication PostProcessor` under Post Processors
- `jp@gc - Inter-Thread Communication PreProcessor` under Pre Processors

## 4. The PostProcessor and PreProcessor

The PostProcessor is the producer. Add it as a child of the sampler that generates the data. It has
two fields:

- **FIFO Queue Name to Put Data Into**: the queue name, for example `order_ids`
- **Value to Put**: the string to enqueue, usually a variable reference such as `${orderId}`

Because it is a PostProcessor, it runs after the sampler and after any extractors placed above it in
the tree. So the typical pattern is: HTTP Request creates an order, JSON Extractor pulls `$.id` into
`orderId`, then the ITC PostProcessor pushes `${orderId}` into `order_ids`.

The PreProcessor is the consumer. Add it as a child of the sampler that needs the data. It has three
fields:

- **FIFO Queue Name to Get Data From**: `order_ids`
- **Variable Name to Store Data**: `orderId`, which you then use as `${orderId}` in the sampler
- **Timeout**: how many seconds to wait for data before giving up

The PreProcessor pops the value, which means it removes it from the queue. Two consumer threads will
never process the same order, which is exactly what you want when simulating a real
producer/consumer workflow.

If the timeout expires without data, the variable is set to the literal string `INTERRUPTED`. Make a
habit of asserting on that. An If Controller with the condition
`${__jexl3("${orderId}" != "INTERRUPTED")}` around the consumer sampler keeps a starved consumer
from sending garbage requests.

## 5. Practical example: producer and consumer thread groups

Here is the scenario I use to explain the plugin. An e-commerce API has two sides. Customers place
orders through `POST /orders`, and a warehouse system polls and fulfils them through
`POST /orders/{id}/fulfil`. The business asked for 20 orders per second placed and fulfilled within
the same test, with fulfilment happening a few seconds after placement, just like production.

Test plan structure:

```text
Test Plan
├── HTTP Request Defaults (api.example.com)
├── Thread Group: Customers (20 threads, loop forever, 10 min)
│   ├── Constant Throughput Timer (1200 samples/min = 20 RPS)
│   └── HTTP Request: POST /orders
│       ├── JSON Extractor: orderId = $.id
│       └── jp@gc - Inter-Thread Communication PostProcessor
│           FIFO Queue Name to Put Data Into: order_ids
│           Value to Put: ${orderId}
└── Thread Group: Warehouse (10 threads, loop forever, 10 min)
    ├── Constant Timer: 3000 ms
    └── HTTP Request: POST /orders/${orderId}/fulfil
        └── jp@gc - Inter-Thread Communication PreProcessor
            FIFO Queue Name to Get Data From: order_ids
            Variable Name to Store Data: orderId
            Timeout: 30
```

What happens at run time:

1. Twenty customer threads create orders at roughly 20 RPS. Each successful response yields an
   `orderId`, which the PostProcessor appends to `order_ids`.
2. Ten warehouse threads each wait 3 seconds, then their PreProcessor pops the oldest order ID from
   the queue and the sampler fulfils it.
3. If a warehouse thread finds the queue empty, it blocks for up to 30 seconds. In steady state that
   never happens because producers are faster than consumers.

Now the numbers. Producers add 20 items per second. Ten consumers each take one item roughly every 3
seconds plus response time, so they drain about 3 items per second. The queue grows by about 17
items per second, or roughly 10,000 items over a 10 minute test. That is intentional for this
scenario, because it mirrors a warehouse that lags behind order intake, but it is the kind of thing
you should calculate up front. If you actually want fulfilment to keep pace, either raise the
warehouse thread count to around 70 or drop the constant timer.

You can watch the backlog live by adding a Dummy Sampler or Debug Sampler in the warehouse group
with `${__fifoSize(order_ids)}` in its response body. In the View Results Tree you will see the
queue depth on every iteration. Swap the Constant Throughput Timer for the
[Throughput Shaping Timer](/blog/how-to-use-jmeter-throughput-shaping-timer-for-realistic-load-profiles/)
if you want the producer rate to ramp rather than sit flat.

## 6. Using the functions instead of the processors

The four functions give you the same queue operations without adding tree elements, which is handy
inside JSR223 scripts, controllers, and parameter fields.

| Function     | What it does                                               | Removes item? | Waits for data?       |
| :----------- | :--------------------------------------------------------- | :------------ | :-------------------- |
| `__fifoPut`  | Adds a value to the queue and returns the stored value     | n/a           | Only if queue is full |
| `__fifoPop`  | Takes the oldest value out of the queue                    | Yes           | Yes, until timeout    |
| `__fifoGet`  | Peeks at the oldest value, or returns empty string if none | No            | No                    |
| `__fifoSize` | Returns the number of items currently in the queue         | No            | No                    |

Syntax:

```text
${__fifoPut(order_ids, ${orderId})}
${__fifoPop(order_ids, orderId)}
${__fifoGet(order_ids, nextOrderId)}
${__fifoSize(order_ids, backlog)}
```

The first argument is always the queue name. For `__fifoPut`, the second argument is the value to
store. For the other three, the second argument is an optional variable name to store the result in,
and the function also returns the value inline, so `${__fifoPop(order_ids)}` on its own works as a
request path parameter.

A subtle but important difference: `__fifoGet` does not remove anything and does not block. If you
use it where you meant `__fifoPop`, every consumer thread will process the same first item forever.
I have debugged exactly this in a test plan that "fulfilled" the same order 40,000 times.

One more note from the documentation: when you use only the functions, queues are not cleared when
the test stops. Leftover items from the previous run will still be there when you start the next
one, until the first `__fifoPut` call clears the queue. The Pre/PostProcessors do clear all queues
at test start and test end. If you rely purely on functions, either add a throwaway PostProcessor
somewhere so the clearing happens, or use queue names that include the test start time, for example
`order_ids_${__time()}` stored once in a User Defined Variable.

## 7. Timeouts and capacity

Two JMeter properties control the blocking behavior:

```properties
# Seconds a pop waits for data before returning INTERRUPTED. Default is unlimited.
kg.apc.jmeter.functions.FifoTimeout=60

# Maximum items per queue. Default is unlimited. Puts on a full queue block.
kg.apc.jmeter.functions.FifoCapacity=5000
```

Put these in `user.properties` or pass them on the command line:

```bash
jmeter -n -t orders.jmx -l results.jtl \
  -Jkg.apc.jmeter.functions.FifoTimeout=60 \
  -Jkg.apc.jmeter.functions.FifoCapacity=5000
```

The PreProcessor's Timeout field overrides the global timeout for that one element, and its default
value is populated from the property. The `__fifoPop` function has no per-call timeout, so the
property is the only way to bound it.

Why this matters: the default timeout is unlimited. If your producer thread group finishes early,
every consumer thread blocks forever on an empty queue and the test never ends. You will see the
thread count in the Active Threads Over Time graph flatline and the test runs until the scheduler
kills it. Always set a timeout in the PreProcessor, and always set `FifoTimeout` when using
`__fifoPop`.

Capacity is the other safety net. In the example above the queue grows by 17 items per second. In a
long soak test that is memory that never gets released until the test ends. Setting `FifoCapacity`
turns unbounded growth into back-pressure: producers block when the queue is full, which also
happens to be realistic behavior for many real message-driven systems.

## 8. Where ITC shines beyond producer/consumer

Once you understand the queue model, a few other patterns fall out naturally.

**Asynchronous downloads.** This is the original use case from the jmeter-plugins.org
[Async Download Tutorial](https://jmeter-plugins.org/wiki/AsyncDownloadTutorial/). A main thread
group browses pages quickly and pushes download URLs into a queue. A separate worker pool pops URLs
and performs the slow downloads, so the main flow's response times are not skewed by 200 MB
transfers. If the concurrent requests belong to the same virtual user and the same page, the
[Parallel Controller](/blog/jmeter-parallel-controller-simulate-ajax-concurrent-requests/) is a
simpler fit; ITC is for when the work belongs to a different actor entirely.

**Token sharing.** One thread logs in with an admin account, obtains a bearer token, and pushes it
with `__fifoPut`. Other threads that need that token call `__fifoGet`, which peeks without removing,
so all of them see the same token. Pair it with a Once Only Controller on the producer side.

**Cross-thread-group synchronization.** A "setup" thread group seeds test data, then puts a single
`READY` marker into a `gate` queue. The load thread group's first sampler has a PreProcessor popping
from `gate`. Every load thread blocks on that pop until setup finishes. The Synchronizing Timer
cannot do this across thread groups; ITC can.

## 9. Common pitfalls

- **Distributed testing.** Queues live in memory inside one JMeter JVM. In a controller/worker
  setup, each worker has its own queues, so a producer on worker A cannot feed a consumer on worker
  B. Keep producer and consumer thread groups on the same engine, or use an external broker. The
  [distributed load testing plugins](/blog/jmeter-plugins-for-distributed-load-testing/) post covers
  what does and does not scale across engines.
- **Unlimited default timeout.** Covered above, but it is the number one reason ITC tests hang.
- **Using `__fifoGet` when you meant `__fifoPop`.** Peek versus take. Peek never drains the queue.
- **Putting an unset variable.** If your extractor fails and `${orderId}` is not defined, the
  PostProcessor will literally enqueue the string `${orderId}`. Put a Response Assertion or a
  default value on the extractor and only push on success, for example by wrapping the
  PostProcessor's sampler in an If Controller.
- **Forgetting that only strings are stored.** Everything goes in as a string. If you need to pass a
  JSON object, serialize it and parse it on the other side with a JSON Extractor on a Dummy Sampler
  or a JSR223 PreProcessor.
- **Stale data between runs.** Functions-only test plans keep queue contents after a stop. Use the
  processors somewhere in the plan, or timestamp your queue names.

## 10. Quick decision guide

Reach for the Inter-Thread Communication plugin when:

- Data produced in one thread group must be consumed in another
- Each value must be consumed exactly once, in order
- Consumers should wait for producers rather than fail immediately
- You want realistic back-pressure between two actors in the system

Skip it when:

- The concurrency is within one virtual user's page load, where the Parallel Controller fits better
- You only need a single shared value and a property with `__setProperty` is enough
- Producer and consumer must sit on different distributed engines

The plugin is tiny and stable, but it unlocks a class of test scenarios that most people assume
JMeter cannot do. Two thread groups talking to each other through a queue is the difference between
"we hit the API with 20 RPS" and "we simulated the actual order lifecycle end to end."

Happy Testing!

Have you used FIFO queues to model a producer/consumer flow in JMeter, or do you still reach for CSV
files and properties? Let me know in the comments.
