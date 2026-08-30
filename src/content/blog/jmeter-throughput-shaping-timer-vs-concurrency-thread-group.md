---
title: "JMeter Throughput Shaping Timer vs Concurrency Thread Group: When to Use Which"
description: "Compare JMeter Throughput Shaping Timer vs Concurrency Thread Group, learn when to control RPS or concurrent users, with a feedback function example."
pubDate: 2026-08-30T12:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/jmeter-throughput-shaping-timer-vs-concurrency-thread-group.png"
imageAlt: "Featured image for JMeter Throughput Shaping Timer vs Concurrency Thread Group: When to Use Which"
tags: ["JMeter", "Throughput Shaping Timer", "Concurrency Thread Group", "Load Testing", "Performance Testing", "JMeter Plugins"]
featured: true
---

# JMeter Throughput Shaping Timer vs Concurrency Thread Group: When to Use Which

In this blog post, we will see how two of the most misunderstood JMeter plugins actually work, the
Throughput Shaping Timer and the Concurrency Thread Group, and when to reach for each one. I have
seen a lot of test plans where these two get used interchangeably, and that usually ends with a
report that technically "passed" but answered the wrong question.

Both of them control load. That is where the similarity ends. One controls the rate of requests. The
other controls how many virtual users are active. Mixing them up, or using the wrong one for your
requirement, is one of the most common reasons performance test results do not match what the
business actually asked for.

## 1. What is the Throughput Shaping Timer?

The Throughput Shaping Timer, or TST, comes from the jp@gc plugin set on jmeter-plugins.org. Its
entire job is to control requests per second, nothing else.

You configure it with a "Requests Per Second Schedule" table, where you define a target RPS and how
long to hold or ramp toward it. During the test, TST delays threads as needed so the actual send
rate matches your schedule.

Here's the part people miss: TST does not care how many threads it takes to hit that number. If it
needs 5 threads to hit 10 RPS, fine. If response times slow down and it needs 40 threads to hit that
same 10 RPS, it will ask for more, as long as your thread group can supply them.

Concrete example: you set a schedule of 10 RPS for the first 60 seconds, then ramp up to 50 RPS over
the next 120 seconds. TST will keep nudging the request rate toward that curve regardless of how
your backend is behaving.

## 2. What is the Concurrency Thread Group?

The Concurrency Thread Group, or CTG, comes from the bzm plugin set (Custom Thread Groups). Its job
is the opposite. It controls how many virtual users are active at any point in the test, and leaves
throughput as a byproduct.

You configure a target concurrency, a ramp up time and steps, and a hold time. CTG will ramp threads
up to that target, hold them there, and ramp down at the end. Whatever RPS comes out of that is just
a result of how many users you have and how fast your system responds.

Same style of example: if you set CTG to hold 8 concurrent users, it will hold exactly 8, whether
your backend responds in 100ms or 2 seconds. The resulting RPS will be different in each case, but
the user count will not move.

## 3. The key difference, explained with one example

This is the concrete example I promised in the outline, because it's the fastest way to see the
distinction.

Say your application responds in 500ms on average.

- 8 users, each waiting 500ms per request, naturally produces around 16 requests per second.
- If you use Concurrency Thread Group and set it to hold 8 users, you will always have 8 users, and
  RPS will float around 16, going up or down as response time changes.
- If you use Throughput Shaping Timer and set it to hit exactly 16 RPS, JMeter will add or remove
  threads as needed to keep hitting that number, even if response time changes.

Same numbers, opposite thing being held constant. That's the whole distinction in one sentence: TST
fixes the rate and lets thread count float, CTG fixes the thread count and lets rate float.

| Plugin                    | What you fix               | What floats              |
| :------------------------ | :------------------------- | :----------------------- |
| Throughput Shaping Timer  | Requests per second        | Number of active threads |
| Concurrency Thread Group  | Number of concurrent users | Resulting throughput     |

## 4. When to use Throughput Shaping Timer

Reach for TST when your requirement is stated as a rate, not a headcount.

- You have an SLA like "the system must sustain 200 RPS for 10 minutes"
- You're testing an API or service with a known or suspected rate limit
- You want to simulate a real traffic pattern, like a steady baseline with a sudden spike,
  independent of how many users that takes
- You're validating autoscaling behavior against a specific load curve

## 5. When to use Concurrency Thread Group

Reach for CTG when your requirement is stated as a user count, not a rate.

- You have a capacity question like "can we support 500 concurrent users on the portal?"
- You're testing session-heavy or UI-driven flows where user count matters more than raw throughput
- You're running a soak or endurance test and need a steady, known number of users held for a long
  duration
- You care about resource usage (memory, connections, threads) that scales with concurrent users
  rather than request rate

## 6. Using them together with the feedback function

Here's where it gets interesting, and where a lot of test plans actually should live: you can
combine both, using the `__tstFeedback` function.

The idea is simple. TST defines the RPS schedule you actually care about. CTG holds the threads.
Instead of you guessing how many threads CTG needs, the feedback function lets TST tell CTG "here's
how many threads you need right now to hit my target," and CTG adjusts automatically.

Setting it up looks roughly like this:

1. Add a Concurrency Thread Group to your Test Plan
2. Add a Throughput Shaping Timer under that thread group
3. Set your RPS schedule in the TST
4. Open the Function Helper Dialog and generate a `__tstFeedback` function, referencing your TST's
   name
5. Use that function's output as the "Target Concurrency" value in the Concurrency Thread Group
   instead of a static number

As shown below, if you watch the Active Threads Over Time listener next to the Throughput Shaping
Timer's own graph, you'll see the thread count rise and fall on its own as it chases your RPS
target, rather than you having to hand-tune it.

One practical tip worth calling out: give CTG a reasonable starting thread count and a high enough
max, or a sensible spare thread pool size. If the pool is too small, you'll see warnings in the log
about not having enough threads to hit the target throughput, and your RPS schedule will fall short
even though everything looks configured correctly.

## 7. Common pitfalls

- Using TST with a plain fixed thread group and too few threads defined, which causes delayed or
  skipped samples once the target RPS needs more threads than you provided
- Using CTG alone when the actual requirement was a throughput number, which produces a report that
  satisfies "we ran with X users" but never confirms the RPS the business actually asked for
- Only watching the timer's own chart and never cross-checking it against the Active Threads Over
  Time listener, which is where you'd catch a starved thread pool
- Forgetting that TST and CTG measure success differently: one reports against RPS, the other
  against concurrency, so pick the listener and pass/fail criteria that matches the one you're
  actually driving

## 8. Quick decision guide

Ask yourself these before picking a plugin:

- Do you have a rate requirement (RPS, TPS)? Lean Throughput Shaping Timer
- Do you have a headcount requirement (concurrent users, sessions)? Lean Concurrency Thread Group
- Do you have both, and want JMeter to manage thread count on its own? Combine them with
  `__tstFeedback`

Neither plugin is "better," they just answer different questions, and most real-world SLAs are
actually one or the other, not both, even if it feels safer to test both angles at once.

Happy Testing!

Which one do you reach for more often in your test plans, RPS-driven or concurrency-driven? Let me
know in the comments.
