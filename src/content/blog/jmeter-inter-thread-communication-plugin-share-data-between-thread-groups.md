---
title: "JMeter Inter-Thread Communication Plugin: How to Share Data Between Thread Groups"
description: "Learn how the JMeter Inter-Thread Communication plugin passes data between thread groups with FIFO queues, __fifoPut and __fifoPop, timeouts, and pitfalls."
pubDate: 2026-09-07T12:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/jmeter-inter-thread-communication-plugin-share-data-between-thread-groups.png"
imageAlt: "Featured image for JMeter Inter-Thread Communication Plugin: How to Share Data Between Thread Groups"
tags:
  [
    "JMeter",
    "JMeter Plugins",
    "Inter-Thread Communication",
    "Thread Groups",
    "Load Testing",
    "Performance Testing",
    "Correlation",
  ]
featured: false
draft: false
---

# JMeter Inter-Thread Communication Plugin: How to Share Data Between Thread Groups

In this blog post, we will see how the JMeter Inter-Thread Communication plugin lets you pass data
between thread groups, something JMeter cannot do on its own. If you have ever needed one thread
group to create an order and another thread group to pick it up and process it, you have already run
into the problem this plugin solves.

JMeter variables are scoped to a single thread. Thread A cannot read a variable that Thread B
extracted, even if both are in the same thread group, and definitely not if they are in different
thread groups. The usual workarounds are properties with `__setProperty`, which are global and racy,
or writing to a file and reading it back, which is slow and fragile. The Inter-Thread Communication
plugin, `jpgc-fifo` in the Plugins Manager, replaces both with named in-memory FIFO queues that any
thread can put into or pop from.

I will cover what the plugin actually provides, the two ways to use it (functions and
pre/post-processors), a full producer-consumer example, and the timeout and queue-clearing behavior
that trips people up.

## 1. What is the Inter-Thread Communication plugin?

The Inter-Thread Communication plugin comes from the jp@gc plugin set on
[jmeter-plugins.org](https://jmeter-plugins.org/wiki/InterThreadCommunication/). Its job is simple:
it maintains global, named string queues inside the JMeter JVM. The queues are First-In, First-Out.
One thread puts a string in, another thread takes it out, and the two threads can be in completely
different thread groups.

There can be any number of queues, and they are distinguished only by name. If two elements use the
queue name `order_ids`, they talk to the same queue.

Under the hood each queue is a Java `LinkedBlockingQueue`, which matters for two reasons:

- Pops can block. A consumer that asks for a value from an empty queue waits until a producer puts
  one in, or until a timeout expires.
- It is thread-safe by design. You do not need a Critical Section Controller around it.

The plugin has been stable for a long time. The current release is 0.2, and it has around 11,800
downloads on [PerfAtlas](/plugin/jpgc-fifo/), which makes it one of the most used jp@gc plugins that
people rarely write about.

## 2. Installing the plugin

Install it via the Plugins Manager by searching for "Inter-Thread Communication", or from the
command line with PluginsManagerCMD:

```bash
PluginsManagerCMD.sh install jpgc-fifo
```

If you do not have the Plugins Manager yet, follow
[How to install JMeter Plugins Manager](/blog/how-to-install-jmeter-plugins-manger/). For CI images,
the [PluginsManagerCMD in Docker](/blog/jmeter-plugin-install-automation-pluginsmanagercmd-docker/)
post shows how to bake `jpgc-fifo` into a container.

After a restart you will see two new elements and four new functions:

| Type          | Name                                             | Purpose                                   |
| :------------ | :----------------------------------------------- | :---------------------------------------- |
| PostProcessor | jp@gc - Inter-Thread Communication PostProcessor | Put a value into a queue after a sampler  |
| PreProcessor  | jp@gc - Inter-Thread Communication PreProcessor  | Pop a value from a queue before a sampler |
| Function      | `__fifoPut(queue, value)`                        | Put a value, returns the stored value     |
| Function      | `__fifoPop(queue, varName)`                      | Pop and remove the head, blocks if empty  |
| Function      | `__fifoGet(queue, varName)`                      | Peek at the head, no wait, no removal     |
| Function      | `__fifoSize(queue, varName)`                     | Number of items currently in the queue    |

The second parameter of `__fifoPop`, `__fifoGet`, and `__fifoSize` is an optional variable name. If
you supply it, the result is stored in that variable as well as being returned inline.

## 3. The functions, explained with numbers

Let's say the queue is called `sync_tokens`. Here is what each function does against it.

```text
${__fifoPut(sync_tokens, ABC-123)}   -> queue: [ABC-123]        returns ABC-123
${__fifoPut(sync_tokens, ABC-124)}   -> queue: [ABC-123,ABC-124] returns ABC-124
${__fifoSize(sync_tokens, qsize)}    -> queue unchanged          returns 2, sets qsize=2
${__fifoGet(sync_tokens, peeked)}    -> queue unchanged          returns ABC-123, sets peeked=ABC-123
${__fifoPop(sync_tokens, token)}     -> queue: [ABC-124]         returns ABC-123, sets token=ABC-123
${__fifoPop(sync_tokens, token)}     -> queue: []                returns ABC-124, sets token=ABC-124
${__fifoPop(sync_tokens, token)}     -> blocks until someone puts, or until timeout
${__fifoGet(sync_tokens, peeked)}    -> queue: []                returns "" immediately
```

The key distinction is `__fifoPop` versus `__fifoGet`. Pop is destructive and blocking, Get is
neither. In a producer-consumer flow you almost always want Pop, because two consumers must never
process the same value. Get is useful for "is there anything waiting?" style checks in an If
Controller.

## 4. Producer-consumer example: create orders, then fulfil them

This is the pattern I use most. One thread group simulates customers placing orders, another
simulates a back-office process that picks orders up and ships them. The order IDs are generated by
the server, so the second group has no way of knowing them without the queue.

Test plan structure:

```text
Test Plan
├── Thread Group: Customers (20 threads, loop forever, 10 min)
│   └── HTTP Request: POST /api/orders
│       ├── JSON Extractor: orderId <- $.id
│       └── jp@gc - Inter-Thread Communication PostProcessor
│             FIFO Queue Name to Put Data Into: order_ids
│             Value to Put: ${orderId}
└── Thread Group: Fulfilment (5 threads, loop forever, 10 min)
    └── HTTP Request: POST /api/orders/${order}/ship
        └── jp@gc - Inter-Thread Communication PreProcessor
              FIFO Queue Name to Get Data From: order_ids
              Variable Name to Store Data: order
              Timeout: 30
```

A few things about why it is wired this way:

- The PostProcessor runs after the `POST /api/orders` sampler and after the JSON Extractor, so
  `${orderId}` is already populated when the value is put into the queue. Order your post-processors
  so the extractor sits above the FIFO put.
- The PreProcessor runs before the `ship` sampler, pops one order ID, stores it in `${order}`, and
  only then does the sampler build its URL.
- The `Timeout` field is in seconds. With 30, a Fulfilment thread that finds the queue empty waits
  up to 30 seconds for a customer to place an order. If nothing arrives, the variable is set to
  `INTERRUPTED` (more on that in section 6).

Both thread groups start at the same time. With 20 customers producing and 5 fulfilment threads
consuming, the queue will grow if order creation is faster than shipping. That is realistic and also
useful: drop a `${__fifoSize(order_ids, backlog)}` into a Debug Sampler or a Flexible File Writer
and you get a live backlog metric that tells you whether your consumer side is keeping up.

The equivalent using only functions, if you prefer not to add elements:

```text
Customers  -> POST /api/orders, then a JSR223 PostProcessor or any element evaluating:
              ${__fifoPut(order_ids, ${orderId})}

Fulfilment -> POST /api/orders/${__fifoPop(order_ids, order)}/ship
```

I prefer the PreProcessor and PostProcessor elements because they are visible in the tree and they
clear the queues at test start and stop, which the functions alone do not.

## 5. Other patterns the FIFO queue is good for

Once you see it as a queue rather than a variable, a few more use cases open up.

- **Asynchronous work offload.** The official
  [Async Download Tutorial](https://jmeter-plugins.org/wiki/AsyncDownloadTutorial/) keeps a main
  thread group iterating over fast page requests while a pool of worker threads pops download URLs
  from the queue and handles the slow transfers. Your main scenario's response times are not
  polluted by the long downloads.
- **Token handoff.** A single login thread group authenticates once every few minutes and puts fresh
  bearer tokens into a queue; API thread groups pop them. This avoids hammering your identity
  provider with one login per virtual user, which is a common source of false bottlenecks.
- **Chat and messaging tests.** One group of "senders" posts messages and puts the message IDs into
  a queue, a group of "receivers" pops and verifies delivery. This works well alongside the
  [WebSocket plugin](/blog/jmeter-websocket-plugin-tutorial-real-time-load-testing/) where the
  receiving side is a long-lived connection in a separate thread group.
- **Cross-group synchronization.** A setup group puts N tokens into a queue after seeding data, and
  every load thread pops one before starting. No thread begins until the seed is finished, and you
  do not need a Synchronizing Timer across groups (which JMeter does not support anyway).

## 6. Timeouts, capacity, and the INTERRUPTED value

This is the part that produces most of the confusion, so it is worth being precise.

**Default timeout is unlimited.** A `__fifoPop` or a PreProcessor pop on an empty queue waits
forever by default. If your producer thread group finishes before the consumer, the consumer threads
will sit there until you stop the test manually. Always set a timeout in a real test.

You can set it in two places:

- Per element, in the `Timeout` field of the PreProcessor (seconds).
- Globally for the functions and as the default for new PreProcessors, with a JMeter property:

```properties
# user.properties or -J on the command line, value in seconds
kg.apc.jmeter.functions.FifoTimeout=30
```

When the timeout expires, the pop returns the literal string `INTERRUPTED` rather than an empty
value or an error. Your sampler will happily send `POST /api/orders/INTERRUPTED/ship` unless you
guard it. Wrap the consumer sampler in an If Controller:

```text
If Controller
  Condition: "${order}" != "INTERRUPTED"
  Interpret Condition as Variable Expression: checked (use __jexl3 or __groovy)
```

Or with `__jexl3`:

```text
${__jexl3("${order}" != "INTERRUPTED")}
```

**Capacity is unlimited by default.** Since version 1.0.1 of the plugin set you can cap the queue
with a second property:

```properties
kg.apc.jmeter.functions.FifoCapacity=1000
```

When a queue is full, put operations block until a pop frees a slot. A cap is a good idea in a long
soak test, because an unbounded queue with a fast producer and a slow consumer is a slow memory leak
inside your JMeter JVM. With 20 producers at 50 orders per second each and 5 consumers handling 30
per second total, you accumulate roughly 970 items per second. Over a one hour soak that is about
3.5 million strings sitting in heap.

## 7. Queue clearing between runs

This one bites people in GUI mode. The behavior differs depending on how you use the plugin:

| How you use it                            | Queues cleared at test start/stop? |
| :---------------------------------------- | :--------------------------------- |
| PreProcessor or PostProcessor elements    | Yes, both                          |
| Functions only (`__fifoPut`, `__fifoPop`) | No                                 |

If you only use functions and run the test twice in the same JMeter GUI session, the second run
starts with whatever was left in the queue from the first run. Your consumers pop stale IDs and you
chase a phantom bug in your application.

Two fixes:

- Add at least one Inter-Thread Communication PreProcessor or PostProcessor somewhere in the plan.
  It registers as a test state listener and clears every queue at start and stop.
- Or make queue names unique per run, for example `order_ids_${__P(run_id)}` with
  `-Jrun_id=$(date +%s)` passed on the command line, so leftovers from a previous run are simply
  never read.

In non-GUI mode this is a non-issue because each run is a fresh JVM.

## 8. Distributed testing caveat

The queues live inside one JMeter process. In a
[distributed test](/blog/jmeter-plugins-for-distributed-load-testing/) each server (slave) has its
own set of queues. A producer on server A cannot feed a consumer on server B.

That is fine as long as your producer and consumer thread groups run on every server with the same
ratio, which is the default when you distribute a single JMX. It is not fine if you planned to run
the producers on one box and the consumers on another. If you genuinely need cross-machine handoff,
the queue has to live outside JMeter, for example in Redis or a real message broker, and you are
then in the territory covered by the
[Kafka load testing](/blog/how-to-test-kafka-message-queues-with-jmeter-the-complete-load-testing-guide/)
post rather than this plugin.

## 9. Inter-Thread Communication vs the alternatives

| Approach                                 | Cross thread group | Thread-safe | Blocking wait     | Cleared per run        |
| :--------------------------------------- | :----------------- | :---------- | :---------------- | :--------------------- |
| JMeter variables                         | No                 | n/a         | No                | Yes                    |
| `__setProperty` / `__P`                  | Yes                | Racy        | No                | No                     |
| Write to CSV, read with CSV Data Set     | Yes                | Weak        | No                | Manual                 |
| `props` in JSR223 with a ConcurrentQueue | Yes                | Yes         | If you code it    | If you code it         |
| Inter-Thread Communication (`jpgc-fifo`) | Yes                | Yes         | Yes, with timeout | With pre/post elements |

The JSR223 route can do everything the plugin does, and more, but you end up writing and maintaining
Groovy on both ends. The plugin gives you the same semantics with two tree elements and zero code,
and it is visible to anyone who opens the JMX later. That is usually the right trade for a
team-owned test plan.

## 10. Common pitfalls

- Leaving the timeout at the default. Consumers wait forever after producers finish, and the test
  never ends on its own.
- Not guarding against `INTERRUPTED`. Timed-out pops become real requests with a garbage ID and
  inflate your error rate for the wrong reason.
- Putting the PostProcessor above the extractor. The value is put into the queue before the
  extractor runs, so you enqueue an empty string or the previous iteration's value.
- Using `__fifoGet` in a consumer. Two threads peek the same head, both act on it, and nothing is
  removed. Use `__fifoPop`.
- Forgetting queue clearing in GUI mode when using functions only. Stale values from the last run
  leak into the next one.
- Expecting the queue to work across distributed servers. It is per-JVM.

## 11. Quick decision guide

- Need to pass server-generated data from one thread group to another? Use Inter-Thread
  Communication with a PostProcessor on the producer and a PreProcessor on the consumer.
- Need consumers to wait for work rather than fail? Use `__fifoPop` or the PreProcessor with a
  sensible `Timeout`, and guard `INTERRUPTED` with an If Controller.
- Just need to check whether work is waiting without taking it? Use `__fifoGet` or `__fifoSize`.
- Need cross-machine handoff in a distributed test? This plugin will not do it, look at an external
  queue instead.

The Inter-Thread Communication plugin is small, old, and unglamorous, but it removes a whole class
of hacks from JMeter test plans. Once producer and consumer flows are modeled as separate thread
groups talking through a queue, your test starts to look like the system it is testing, and the
numbers get a lot easier to explain.

Happy Testing!

Have you used FIFO queues in your test plans, or do you still lean on properties and CSV files to
pass data around? Let me know in the comments.
