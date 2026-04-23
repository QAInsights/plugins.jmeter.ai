---
title: "How to Use JMeter's Throughput Shaping Timer for Realistic Load Profiles"
description: "Learn how to use JMeter's Throughput Shaping Timer to simulate realistic load profiles and improve your load testing accuracy."
pubDate: 2026-04-24T14:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/throughput-shaping-timer-jmeter.png"
imageAlt: "Abstract visualization of JMeter's Throughput Shaping Timer for realistic load profiles"
tags: ["JMeter", "Throughput Shaping Timer", "Load Testing", "Performance Testing", "Realistic Rps", "JMeter Plugins"]
featured: true
---

# Introduction

One of the most common mistakes in JMeter load testing is sizing thread counts by gut feeling. You pick 50 threads, watch your server curl up, lower it to 20, and call it a day. The actual question you should be asking is: how many requests per second is my system expected to handle?

The Throughput Shaping Timer answers that question directly. Instead of thinking in threads, you think in requests per second (RPS). You define a schedule that looks like real production traffic, and the plugin does the math to honor it. 

This article explains how the plugin works, how to configure a realistic load profile, how to pair it with the Concurrency Thread Group for open-workload behavior, and how to drive the whole setup from a CI pipeline in 2026.

# What Is the Throughput Shaping Timer?

The Throughput Shaping Timer is a JMeter plugin from the jp@gc family, originally created by Andrey Pokhilko. It lives in the Standard Set inside the JMeter Plugins Manager. If you have not installed Plugins Manager yet, download the .jar from jmeter-plugins.org and drop it into your lib/ext folder.

Once installed, you will find it under:
Add > Timer > jp@gc - Throughput Shaping Timer

The plugin solves a specific problem: JMeter's default thread model is a closed workload model. You set a fixed number of threads and they hammer the server as fast as they can. Real production traffic does not work that way. Users arrive independently. Traffic ramps, peaks, and drops on a schedule. The Throughput Shaping Timer lets you model that behavior by defining a target RPS schedule instead of a thread count.

## Understanding the Schedule Table

When you open the Throughput Shaping Timer UI, you see a table with three columns:

| Column | Description |
|---------|-------------|
| Start RPS | The requests per second at the beginning of this row |
| End RPS | The requests per second at the end of this row |
| Duration (sec) | How long this row runs in seconds |

The plugin interpolates RPS linearly between Start RPS and End RPS across the Duration. A live preview graph updates as you edit the table, giving you an instant visual of your load shape.

Example schedule:

| Start RPS | End RPS | Duration (sec) |
|-----------|---------|----------------|
| 0         | 10      | 30             |
| 10        | 10      | 60             |
| 10        | 100     | 120            |
| 100       | 100     | 300            |
| 100       | 0       | 60             |

This schedule ramps from 0 to 10 RPS, holds, spikes to 100 RPS over two minutes, sustains peak for five minutes, then ramps back down. That is a realistic load profile for an e-commerce site handling a flash sale window.

## Critical Behavior You Must Know

The timer can only delay threads, not create them

This is the most important constraint. The Throughput Shaping Timer works by adding delays between requests to throttle throughput. It cannot spin up new threads. If you do not have enough threads in your Thread Group, your actual RPS will fall short of the target, and no amount of timer configuration will fix that.

The test stops when the schedule ends

As soon as the last row in your schedule table expires, JMeter stops the test. Make sure your schedule duration matches your intended test duration. If you have ramp-down logic elsewhere, include it in the schedule.

You must size your thread pool correctly

Because the timer can only delay threads, you need to provision enough threads upfront. The formula is:
```
Thread Pool = RPS × (max response time in ms / 1000)
```
For example, if your peak target is 100 RPS and your worst-case response time is 2000 ms:
```
Thread Pool = 100 × (2000 / 1000) = 200 threads
```
Add a safety margin of 20 to 30 percent on top of that. Undersizing the thread pool is the number one reason for RPS shortfalls when using this plugin.

## Pairing With the Concurrency Thread Group for Open Workload Tests

A fixed thread pool works for many tests, but it still models a closed workload at the thread level. For true open workload behavior, where threads are created dynamically based on demand rather than provisioned upfront, pair the Throughput Shaping Timer with the jp@gc Concurrency Thread Group.

The Concurrency Thread Group supports a feedback function that reads the timer's current demand and adjusts the live thread count accordingly:
```
${__tstFeedback(your-timer-name,1,100,10)}
```
The parameters are:

| Parameter | Meaning |
|-----------|---------|
| your-timer-name | The name you gave your Throughput Shaping Timer element |
| 1 | Minimum threads to keep alive |
| 100 | Maximum threads the group is allowed to spawn |
| 10 | How many threads to add per step when demand increases |

Set this expression as the Target Concurrency in the Concurrency Thread Group. At runtime, JMeter will dynamically grow or shrink the thread pool to match the RPS target defined in the timer schedule.

## Why this matters: the end-of-test spike problem
With a plain Thread Group, all threads are alive from the start. At the beginning of a low-RPS ramp, they pile up waiting for their turn. When the timer finally releases them at high RPS, you can see a spike that overshoots your target. The feedback function solves this by only creating threads when the timer actually needs them.

## Driving the Timer From a CI Pipeline

In 2026, most teams run JMeter from a CI pipeline, whether that is Jenkins, GitHub Actions, GitLab CI, or another tool. The Throughput Shaping Timer supports a schedule string syntax you can pass as a command-line property:

```bash
jmeter -n -t mytest.jmx \
  -J"load_profile=const(10,10s) line(10,100,1m) step(5,25,5,1h)"
```
In your test plan, reference this property inside the timer's schedule field:

```
${__P(load_profile)}
```

The schedule functions available are:

| Function | Description |
|----------|-------------|
| const(rps, duration) | Constant RPS for a given duration |
| line(startRPS, endRPS, duration) | Linear ramp between two RPS values |
| step(startRPS, endRPS, stepSize, duration) | Staircase ramp in fixed increments |

This means you can parameterize your entire load shape from outside the JMX file, making it easy to run different profiles (smoke, load, stress, soak) from the same test plan by varying a single pipeline variable.

## Monitoring the Timer at Runtime

The Throughput Shaping Timer exposes two JMeter properties you can read during a live test run for monitoring and scripting purposes:

| Property | Description |
|----------|-------------|
| timerName_rps | The current target RPS for that timer |
| timerName_cntDelayed | How many threads the timer is currently delaying |

Replace timerName with the actual name of your timer element. You can surface these values in a Backend Listener, a BeanShell/JSR223 sampler that writes to a log, or an external monitoring dashboard.
If cntDelayed is consistently high relative to your thread pool size, it means threads are being throttled and your pool may be undersized. If it is near zero while actual RPS is below target, your thread pool is too small to generate the load.

## Step-by-Step Configuration Guide

Here is the full setup walkthrough from scratch.

### Step 1: Install the plugin

Open JMeter.
Go to Options > Plugins Manager.
Search for jpgc - Standard Set.
Select it, click Apply Changes and Restart JMeter.

### Step 2: Add the Concurrency Thread Group

Right-click your Test Plan.
Select Add > Threads > jp@gc - Concurrency Thread Group.
Set Target Concurrency to: ${__tstFeedback(TST,1,200,10)}
Set Ramp-Up Time to 0 (the timer controls pacing, not the thread group ramp).
Set Hold Target Rate Time to match your total schedule duration.

### Step 3: Add the Throughput Shaping Timer

Right-click your Thread Group (or a specific Sampler if you want sampler-level control).
Select Add > Timer > jp@gc - Throughput Shaping Timer.
Name it TST (this must match the name in your __tstFeedback function).
Build your schedule table row by row.
Confirm the preview graph looks correct.

### Step 4: Size the thread pool

Calculate your maximum required threads:
```
Max RPS (from schedule) × (expected p99 response time ms / 1000) × 1.3 (safety factor)
```
Use this as your Concurrency Thread Group's Maximum Concurrency cap.

### Step 5: Run locally, then promote to CI

Run a short smoke test locally with a low-RPS constant profile to confirm the plugin fires correctly. Then parameterize the schedule using `${__P(load_profile)}` and add the `-J` flag to your CI command.

## Common Pitfalls and How to Avoid Them

Pitfall 1: Thread pool too small

Symptom: Actual RPS is below target even at steady state.

Fix: Recalculate using the formula RPS × (response time / 1000) and add headroom.

Pitfall 2: Timer name mismatch in feedback function

Symptom: The Concurrency Thread Group does not scale up or grows unbounded.

Fix: Make sure the name in __tstFeedback() exactly matches the timer element name, including case.

Pitfall 3: Timer placed at the wrong scope

Symptom: Only one sampler is throttled, or no throttling occurs.

Fix: If you want the timer to control all samplers in a Thread Group, add it directly under the Thread Group, not under a single sampler.

Pitfall 4: Schedule ends before your assertions complete

Symptom: The test cuts off unexpectedly before your teardown logic runs.

Fix: Add a small const(0, 10s) row at the end of your schedule to give teardown time to execute.

Pitfall 5: Ignoring cntDelayed during soak tests

Symptom: You think the test is running fine, but actual throughput drifted from the target hours in.

Fix: Export timerName_cntDelayed to your monitoring stack and alert on sustained high values.

## Real-World Load Profile Examples

### E-commerce flash sale
```
const(5, 2m)          # baseline before sale
line(5, 150, 5m)      # rapid ramp as sale opens
const(150, 15m)       # peak sale window
line(150, 20, 5m)     # tail off
const(20, 5m)         # post-sale baseline
```

### API backend nightly batch
```
const(2, 30m)         # off-hours low traffic
line(2, 80, 10m)      # batch job triggers
const(80, 2h)         # sustained batch load
line(80, 2, 10m)      # batch completes
```

### Staircase stress test
```
step(10, 100, 10, 1h) # add 10 RPS every 6 minutes
```

## Using AI to Optimize Your Shaping Timer

Inside the [Feather Wand](https://jmeter.ai) plugin from QAInsights, you can ask the AI to create a load profile for you in plain language. The AI will then generate a schedule table with the thread math already calculated, so you do not have to calculate the ceiling manually.

## Summary

The Throughput Shaping Timer is the right tool when you need to move from thread-based thinking to RPS-based thinking. The setup comes down to four decisions:

Define your schedule using the Start RPS / End RPS / Duration table.
Size your thread pool using the RPS × (response time / 1000) formula.
Use the feedback function with the Concurrency Thread Group to get true open-workload behavior.
Parameterize from CI using -J"load_profile=..." so the same JMX runs every profile.

Get those four things right and you will produce load profiles that closely reflect what your system sees in production, rather than the synthetic, step-function patterns that give false confidence in your capacity planning.
