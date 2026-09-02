---
title: "JMeter Parallel Controller: How to Simulate AJAX and Concurrent Requests"
description: "Learn how the JMeter Parallel Controller plugin runs samplers concurrently to simulate AJAX calls and browser-style page loads, with JMX examples and pitfalls."
pubDate: 2026-09-02T12:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/jmeter-parallel-controller-simulate-ajax-concurrent-requests.png"
imageAlt: "Featured image for JMeter Parallel Controller: How to Simulate AJAX and Concurrent Requests"
tags:
  ["JMeter", "JMeter Plugins", "Parallel Controller", "AJAX", "Load Testing", "Performance Testing"]
featured: false
draft: false
---

# JMeter Parallel Controller: How to Simulate AJAX and Concurrent Requests

In this blog post, we will see how the JMeter Parallel Controller plugin works, why you need it when
your application fires several requests at the same time, and how to configure it without producing
misleading numbers. I have reviewed plenty of test plans where a single page load was modeled as
twelve HTTP samplers stacked one below the other. The response time report looked fine, but it was
measuring something no real browser ever does.

Out of the box, JMeter runs everything inside a thread strictly in sequence. One virtual user sends
one request, waits for the response, then sends the next. Real browsers and single-page applications
do not behave like that. A dashboard page might trigger the HTML document, then six AJAX calls to
different endpoints, all in flight together. If you model that as six sequential samplers, your
"page load time" is the sum of six response times instead of the slowest one, and the concurrency
your backend actually sees is far lower than production.

The Parallel Controller from the bzm plugin set fixes this gap. It is one of the most downloaded
non-jp@gc plugins in the ecosystem, with over 9,000 downloads tracked on
[PerfAtlas](/plugin/bzm-parallel/), and it is still actively maintained (the last release landed in
late 2025).

## 1. What is the JMeter Parallel Controller?

The Parallel Controller is part of the
[jmeter-bzm-plugins](https://github.com/Blazemeter/jmeter-bzm-plugins/blob/master/parallel/Parallel.md)
repository maintained by BlazeMeter. On jmeter-plugins.org it is listed as "Parallel Controller &
Sampler" with the id `bzm-parallel`. The package ships two elements:

| Element                      | Type       | What it does                                                              |
| ---------------------------- | ---------- | ------------------------------------------------------------------------- |
| bzm - Parallel Controller    | Controller | Runs every direct child element concurrently instead of sequentially      |
| bzm - Parallel HTTP Requests | Sampler    | Fetches a list of URLs in parallel, similar to embedded resource download |

Internally, the controller is implemented as a sampler
(`com.blazemeter.jmeter.controller.ParallelSampler`). When a thread reaches it, the plugin spins up
one worker thread per direct child, wraps each child in a single-iteration loop, submits them to an
executor, and waits until every one of them finishes. Only then does the parent JMeter thread move
on to the next element in the test plan.

That last part matters. The Parallel Controller is not a way to add more virtual users. It is a way
to make one virtual user do several things at once, exactly like a browser does after it parses the
HTML.

## 2. Installing the plugin

The easiest path is the Plugins Manager. If you have not set it up yet, follow
[How to install JMeter Plugins Manager](/blog/how-to-install-jmeter-plugins-manger/) first.

In the GUI, open Options > Plugins Manager > Available Plugins, search for "Parallel Controller &
Sampler", tick it, and click Apply Changes and Restart JMeter.

For CI images and headless machines, use the command-line tool:

```bash
# from the JMeter home directory
./bin/PluginsManagerCMD.sh install bzm-parallel
```

If you bake plugins into a Docker image, the
[PluginsManagerCMD in Docker](/blog/jmeter-plugin-install-automation-pluginsmanagercmd-docker/) post
covers the full workflow. The plugin metadata declares JMeter 3.1 as the minimum version, and it
works fine on the current 5.6.x line.

After a restart you will find the two elements under Add > Logic Controller > bzm - Parallel
Controller and Add > Sampler > bzm - Parallel HTTP Requests.

## 3. Configuring the Parallel Controller

The controller GUI has exactly three settings, which is one of the reasons I like it.

| Setting                 | Default   | Meaning                                                          |
| ----------------------- | --------- | ---------------------------------------------------------------- |
| Generate parent sample  | unchecked | Emit one aggregated result whose elapsed time spans all children |
| Limit max thread number | unchecked | Cap how many children run at the same time                       |
| Max threads             | 6         | The cap used when the limit is enabled; ignored otherwise        |

**Generate parent sample** is the option you want for page-level timings. With it enabled, the
listener shows one entry named after the controller, and its elapsed time is measured from the start
of the first child to the end of the last one. The children still appear as sub-results, so you can
drill into them in a View Results Tree. The request body of the parent sample lists the children
under a "Parallel items:" heading, which is handy for debugging.

**Limit max thread number** exists because browsers do not open unlimited connections. Chrome and
Firefox both cap at 6 connections per host for HTTP/1.1, and the plugin default of 6 mirrors that.
If you leave the limit off, the plugin uses a cached thread pool and starts every child immediately.
For twenty children that means twenty concurrent connections from a single virtual user, which is a
harsher load than any browser would generate against an HTTP/1.1 server.

Here is what the element looks like in a JMX file once configured for a realistic page load:

```xml
<com.blazemeter.jmeter.controller.ParallelSampler
    guiclass="com.blazemeter.jmeter.controller.ParallelControllerGui"
    testclass="com.blazemeter.jmeter.controller.ParallelSampler"
    testname="Dashboard - AJAX calls" enabled="true">
  <boolProp name="PARENT_SAMPLE">true</boolProp>
  <boolProp name="LIMIT_MAX_THREAD_NUMBER">true</boolProp>
  <intProp name="MAX_THREAD_NUMBER">6</intProp>
</com.blazemeter.jmeter.controller.ParallelSampler>
<hashTree>
  <!-- HTTP samplers for /api/summary, /api/notifications, ... go here -->
</hashTree>
```

The three property names, `PARENT_SAMPLE`, `LIMIT_MAX_THREAD_NUMBER`, and `MAX_THREAD_NUMBER`, match
the constants in the plugin source, so you can safely template them if you generate test plans
programmatically.

## 4. A concrete example: modeling a dashboard page load

Let me walk through the scenario I use when explaining this plugin to a team.

A dashboard page in a SaaS product does the following when a user lands on it:

1. `GET /dashboard` returns the HTML shell (about 120 ms).
2. The JavaScript bundle then fires five API calls at once: `/api/summary` (300 ms), `/api/charts`
   (450 ms), `/api/notifications` (90 ms), `/api/activity` (220 ms), and `/api/user` (60 ms).

Modeled sequentially, JMeter reports the page at roughly 120 + 300 + 450 + 90 + 220 + 60 = 1,240 ms.
Modeled with the Parallel Controller and a parent sample, the API portion takes as long as the
slowest call, so the page reports about 120 + 450 = 570 ms. That is a 2x difference in the headline
number, and the parallel version is the one that matches what the browser's network tab shows.

The test plan structure looks like this:

```text
Thread Group (50 users, 60 s ramp-up)
└── Transaction Controller: Dashboard page
    ├── HTTP Request: GET /dashboard
    └── bzm - Parallel Controller (parent sample on, limit 6)
        ├── HTTP Request: GET /api/summary
        ├── HTTP Request: GET /api/charts
        ├── HTTP Request: GET /api/notifications
        ├── HTTP Request: GET /api/activity
        └── HTTP Request: GET /api/user
```

A few practical notes on this layout:

- Put the HTML request outside the Parallel Controller. In a real browser the API calls cannot start
  until the document and script are parsed, so they should be sequential relative to the shell.
- Keep the Transaction Controller's "Generate parent sample" unchecked if the Parallel Controller
  has its own enabled. The plugin README documents nesting problems when both generate parent
  samples at the same time (more on that in the pitfalls section).
- Add a Constant Timer or Uniform Random Timer after the Parallel Controller, not inside it. A timer
  placed as a child of the controller applies to each parallel branch, which will skew the timing.
  If you want to go deeper on think time, the
  [JMeter timer plugins](/blog/jmeter-timer-plugins-simulate-real-user-think-time/) post covers the
  options.

## 5. Sharing data between parallel branches

Each parallel branch runs in its own JMeter thread, but the plugin injects the parent thread's
variable map into every child. In practice that means a value you extracted before the controller,
for example a session token or a `userId` from the login response, is readable inside every parallel
sampler with the usual `${token}` syntax.

The reverse direction also works, since the branches delegate reads and writes to the same
underlying variables object. If `/api/user` extracts `${accountId}` with a JSON Extractor, a sampler
placed after the Parallel Controller can use it. What you should avoid is two branches writing the
same variable name at the same time. There is no locking, and the last writer wins. Give each
extractor a unique variable name and you will not hit this.

Cookies behave in the same way. The HTTP Cookie Manager is shared by the parent thread, so the
session cookie set by the login step is sent by all parallel requests, and the HTTP Header Manager
scoped at the Thread Group level applies to all of them too.

## 6. Parallel HTTP Requests sampler for static resources

The second element in the package solves a narrower problem. Sometimes you do not need a full
controller tree; you just have a list of URLs (images, CSS, fonts, tracking pixels) that the page
pulls in and you want them fetched concurrently without hitting the main page again.

The Parallel HTTP Requests sampler gives you a table where you click Add Row and paste one URL per
row. On execution, it downloads every URL in parallel and reports a single sample, very similar to
what the built-in "Retrieve All Embedded Resources" option does, except you control the list
explicitly rather than relying on JMeter's HTML parser.

I reach for this when:

- the resources come from a CDN domain that JMeter's embedded resource parser would exclude with my
  URL filter, but I still want them in the timing;
- the page is rendered client-side, so there is no HTML for JMeter to parse and the resource list is
  only discoverable from the browser's network tab;
- I want to replay a captured HAR's static asset list without maintaining twenty individual
  samplers.

For everything else, the Parallel Controller with real HTTP samplers as children is more flexible
because each child can have its own assertions, extractors, and headers.

## 7. Parallel Controller vs more threads vs embedded resources

This is the comparison question I get most often, so here is the short version.

| Approach                         | Simulates                                  | Best for                                                         |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| More threads in the Thread Group | More users, each still sequential          | Increasing overall load, not fixing per-user realism             |
| Retrieve All Embedded Resources  | Browser fetching assets referenced in HTML | Classic server-rendered pages with images, CSS, JS in the markup |
| Parallel Controller              | One user firing several requests at once   | AJAX/API calls, SPAs, anything the HTML parser cannot discover   |
| Parallel HTTP Requests sampler   | One user fetching a fixed URL list at once | Explicit static asset lists, CDN resources, HAR replays          |

Adding threads is about load volume. The Parallel Controller is about the shape of each user's
traffic. You usually need both: a
[Concurrency Thread Group or Throughput Shaping Timer](/blog/jmeter-throughput-shaping-timer-vs-concurrency-thread-group/)
to control how much load hits the system, and Parallel Controllers inside the flow so each virtual
user generates the same burst pattern a browser would.

One capacity planning detail: every parallel branch is a real Java thread while it runs. If you have
200 virtual users and each one enters a Parallel Controller with 6 children, your load generator
briefly runs up to 1,400 threads. That is fine on a reasonably sized machine, but it is worth
knowing when you size heap and thread stack settings, especially in
[distributed setups](/blog/jmeter-plugins-for-distributed-load-testing/).

## 8. Common pitfalls

**Nesting with Transaction Controllers.** The plugin README is explicit that the Parallel Controller
does not fully support Transaction Controllers, and it lists three known combinations that produce
odd result trees. The safest layouts are: Transaction Controller outside with parent sample off and
Parallel Controller inside with parent sample on, or skip the Transaction Controller entirely and
let the Parallel Controller's parent sample be your page-level metric.

**Timers and assertions inside the controller.** Anything placed as a direct child becomes a
parallel branch. A timer placed at that level is not "a timer for the controller"; it is a branch
that sleeps. Put timers, assertions, and post-processors on the individual HTTP samplers or after
the controller.

**Forgetting the thread limit.** Without "Limit max thread number", a controller with 30 children
opens 30 concurrent connections per user. Compare that with a browser's 6 per host on HTTP/1.1 and
you will understand why the server side looks worse than production. Set the limit unless you are
deliberately testing an HTTP/2 multiplexed scenario.

**Reading the report wrong.** With the parent sample enabled, the Aggregate Report shows both the
parent and each child. Do not add them together. The parent already represents the wall-clock time
of the whole group. If you stream results to a dashboard, filter on the parent label for page-level
SLAs and on the child labels for endpoint-level ones.

**Loop Controllers as children.** Each child is wrapped in a single-iteration loop by the plugin. If
you nest a Loop Controller with 10 iterations inside, that branch will still run its 10 iterations
sequentially within its own thread. That is expected behavior, but it surprises people who assumed
every sampler would end up parallel.

## 9. Quick decision guide

- Your page or SPA fires several API calls at once after load: use the Parallel Controller with
  parent sample on and a thread limit of 6.
- You have a fixed list of static URLs and no HTML to parse: use the Parallel HTTP Requests sampler.
- Your page is server-rendered with assets in the markup: try "Retrieve All Embedded Resources"
  first, and add a Parallel Controller only for the AJAX calls the parser cannot see.
- You need more overall load: that is a Thread Group or load-shaping plugin problem, not a Parallel
  Controller problem.

## Conclusion

The JMeter Parallel Controller closes the single biggest realism gap in JMeter's threading model:
one virtual user, several concurrent requests. Enable the parent sample so your report speaks in
page-level numbers, cap the thread count at 6 to match browser behavior, keep Transaction
Controllers from fighting over the parent sample, and place timers outside the controller. Do those
four things and your dashboard load times will finally line up with what the browser network tab has
been telling you all along.

You can find the plugin, its download trend, and compatibility details on the
[Parallel Controller & Sampler page](/plugin/bzm-parallel/) on PerfAtlas.
