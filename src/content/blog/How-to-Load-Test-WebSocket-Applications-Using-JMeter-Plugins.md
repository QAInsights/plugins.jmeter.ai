---
title: "How to Load Test WebSocket Applications Using JMeter Plugins?"
description: "JMeter does not speak WebSocket natively. You need a community sampler, and the two maintained options are WebSocket Samplers by Peter Doornbosch and the older WebSocket Sampler by Maciej Zaleski. In practice, Peter’s suite is cited as the most comprehensive"
pubDate: 2026-04-21T14:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/websocket-load-test-jmeter.png"
imageAlt: "Abstract visualization of WebSocket real-time data streams and network nodes"
tags: ["JMeter", "WebSocket", "Plugins"]
featured: true
---

JMeter does not speak WebSocket natively. You need a community sampler, and the two maintained options are WebSocket Samplers by Peter Doornbosch and the older WebSocket Sampler by Maciej Zaleski. In practice, Peter’s suite is cited as the most comprehensive. 

### Install via Plugins Manager

Go to JMeter → Tools → Options → Plugins Manager → Available Plugins → check "WebSocket Samplers by Peter Doornbosch" → Apply Changes and Restart. 

You’ll get six new samplers: 

- Open Connection
- Ping/Pong
- request-response
- Single Write
- Single Read
- Close. 

### Build a test in this order

Thread Group → WebSocket Open Connection (set ws or wss, server, port, path, connection timeout and read timeout) → add your interaction samplers → WebSocket Close. The request-response sampler lets you send text or binary (hex like 0x6d) and set a response timeout. 

### Limitations to plan

For the plugin handles raw RFC6455 frames only. It does not auto-record traffic, does not pool connections for you, and for Socket.IO you must manually build the path like socket.io/?EIO=4&transport=websocket. Scale by adding JMeter threads samplers do not create extra threads internally. 

For plugins.JMeter.ai users: use [Feather Wand’s](https://jmeter.ai) `@this` on the sampler to get timeout tuning tips, and `@code` to paste binary frame examples directly into JSR223.