---
title: "Real-Time JMeter Metrics with Prometheus and Grafana Using the Backend Listener"
description: "Learn how to stream JMeter test results to Prometheus and build a live Grafana dashboard using the Backend Listener plugin. Step-by-step guide for observability teams."
pubDate: 2026-05-11T12:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/real-time-jmeter-prometheus-grafana.png"
imageAlt: "Real-Time JMeter Metrics Dashboard with Prometheus and Grafana"
tags: ["JMeter", "Grafana", "Prometheus", "Real-Time Metrics", "Dashboard", "Observability", "Backend Listener", "Load Testing", "Performance Testing"]
featured: true
---

# Real-Time JMeter Metrics with Prometheus and Grafana Using the Backend Listener

In this blog post, we will see how to stream JMeter test results to Prometheus and build a live Grafana dashboard using the Backend Listener plugin.

If you have ever stared at JMeter's Summary Report during a long test run and wondered what was happening right now across your system, this post is for you.

> **AEO Quick Answer:** 
> How do you stream real-time JMeter metrics to Prometheus and Grafana? 
> You install the community **JMeter Prometheus Plugin** JAR in your JMeter `lib/ext` directory. Next, you add the `PrometheusListener` Backend Listener to your test plan, which exposes a metrics endpoint (typically on port 9270) at runtime. Finally, you configure Prometheus to scrape this endpoint and point Grafana to Prometheus to build live, persistent test-run dashboards.

## Why Real-Time Visibility Matters

JMeter's built-in listeners like Summary Report and View Results Tree are great for a quick sanity check. But they only show you what happened within the current session. The moment you close JMeter, the data is gone.
For teams running continuous performance testing in CI/CD pipelines, that is not good enough. You need persistent, live metrics that anyone on the team can look at, including developers, product managers, and SREs, without having to open JMeter at all.

That is where Prometheus and Grafana come in.

## How I Ended Up Here

A while back, I was running a performance test on a project where the team's monitoring stack was Prometheus and Grafana. I initially shared a Dynatrace dashboard link for real-time test results, but the feedback was immediate: "Too much going on. Can we see just the test metrics?"

That pushed me to explore the Prometheus path for JMeter. I wrote about it briefly in an earlier post. This post is the complete, updated, end-to-end guide with Docker Compose, proper configuration, and tips I have picked up since then.

## Architecture Overview

Before we jump in, here is the high-level picture of what we are building.

JMeter Test Plan
      |
      v
Backend Listener (PrometheusListener)
      |
      | Exposes HTTP metrics endpoint
      v
http://localhost:9270/metrics
      |
      | Prometheus scrapes this endpoint
      v
Prometheus (time-series database)
      |
      | Grafana queries Prometheus
      v
Grafana Dashboard (live panels)

A key thing to understand here: Prometheus is a pull-based system. It scrapes your metrics endpoint at regular intervals (default every 15 seconds). This is different from the InfluxDB path where JMeter pushes data to the database.

For most teams already running a Prometheus + Grafana stack for infrastructure monitoring, this integration slots in naturally. No extra write endpoint to configure, no tokens to manage.

## Prerequisites

Before we start, make sure you have the following in place.

Apache JMeter (latest stable version recommended; grab it from jmeter.apache.org)
Java 11 or higher (required by recent JMeter versions)
Docker and Docker Compose (we will use this for Prometheus and Grafana)
A basic JMeter test plan with at least one HTTP Request sampler
Familiarity with the JMeter GUI


## Installing the Prometheus Plugin

JMeter ships with built-in support for Graphite and InfluxDB via the Backend Listener. Prometheus support comes from a community plugin: jmeter-prometheus-plugin by Jeff Ohrstrom.

Here are the steps to install it.

Head to github.com/johrstrom/jmeter-prometheus-plugin/releases and download the latest JAR file.

Copy the JAR into your JMeter lib/ext/ folder, as shown below.

```bash
cp jmeter-prometheus-plugin-*.jar $JMETER_HOME/lib/ext/
```

Restart JMeter.

Open any test plan, right-click on the Thread Group, and go to Add > Listener > Backend Listener. You should now see com.github.johrstrom.listener.PrometheusListener in the implementation dropdown, as shown below.

Tip: If the JAR does not show up, double-check that it landed in lib/ext/ and not lib/. That is the most common mistake.

## Configuring the Backend Listener in JMeter

Now let us wire up the Backend Listener in your test plan.

### Adding the Listener

Right-click on your Thread Group (not the Test Plan root, unless you want it applying globally).
Go to Add > Listener > Backend Listener.
In the Backend Listener implementation dropdown, select com.github.johrstrom.listener.PrometheusListener, as shown below.

### Key Parameters

The listener exposes several configuration parameters. Here is what each one does.

| Parameter | Default | What It Does |
|-----------|---------|----------------|
| prometheus.ip | 127.0.0.1 | IP the HTTP server binds to. Use 0.0.0.0 for Docker or remote access. |
| prometheus.port | 9270 | Port where /metrics is exposed. |
| prometheus.delay_seconds | 0 | Delay before the endpoint is available. |
| save.assertions | true | Whether to include assertion results in metrics. |

For a typical local setup, the defaults work fine. For Docker or CI environments, change prometheus.ip to 0.0.0.0 so the host machine can reach the endpoint.

### What Metrics Are Exposed?

By default, the plugin exposes metrics like these.

jmeter_rt_as_summary (response time summary with quantiles)
jmeter_response_code (counter by HTTP status code)
jmeter_assertions (pass/fail counters)
jmeter_active_threads (current virtual user count)

The plugin also supports a Prometheus Listener Config element if you want to define fully custom metrics with your own labels and histogram buckets. That is a more advanced topic for a follow-up post.

## Spinning Up Prometheus with Docker Compose

We will use Docker Compose to run the full observability stack. Let us start with Prometheus.
Create a folder called jmeter-observability and add the following files inside it.

prometheus.yml

This is the Prometheus configuration file. Add the scrape job pointing at your JMeter metrics endpoint.

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'jmeter'
    static_configs:
      - targets: ['host.docker.internal:9270']
```

Note: host.docker.internal is the hostname Docker uses on Mac and Windows to reach the host machine. On Linux, replace it with your host's actual IP address (e.g. 172.17.0.1).

`docker-compose.yml` (Prometheus section)
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

volumes:
  prometheus_data:
```

Start Prometheus with the following command.

```bash
docker compose up -d prometheus
```

Head to http://localhost:9090/targets and confirm the jmeter target shows as UP, as shown below. If it shows as DOWN, the JMeter test is not running yet or the endpoint is not reachable.
To do a quick sanity check, run a test in JMeter and then open the Prometheus expression browser at http://localhost:9090. Try querying jmeter_active_threads and you should see a value.

##  Spinning Up Grafana with Docker Compose

Now add Grafana to the same docker-compose.yml.

Updated docker-compose.yml

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus

volumes:
  prometheus_data:
  grafana_data:
```

Start the full stack.

```bash
docker compose up -d
```

Head to http://localhost:3000 and log in with admin / admin. Grafana will prompt you to change the password on first login.

## Adding Prometheus as a Data Source

In Grafana, go to `Connections > Data Sources > Add data source`.
Select Prometheus.
Set the URL to http://prometheus:9090 (Grafana can reach Prometheus by container name inside Docker Compose).
Click Save and Test. You should see a green "Data source is working" message, as shown below.

## Importing the Sample Dashboard

The jmeter-prometheus-plugin repo includes a sample dashboard. You can also import dashboard ID 2492 directly from Grafana Labs.

In Grafana, go to `Dashboards > Import`.
Enter `2492` in the dashboard ID field.
Select your Prometheus data source.
Click `Import`, as shown below.

You will now see panels for throughput, response time percentiles, error rate, and active thread count.

## Running a Test and Watching It Live

With the full stack running, it is time to see it in action.

Open your JMeter test plan (with the Backend Listener configured).
Run the test in non-GUI mode for better accuracy.

```bash
jmeter -n -t your-test-plan.jmx -l results.jtl
```

Head to http://localhost:3000 and open the JMeter dashboard.
Watch the panels update in real time as the test runs, as shown below.

A few things to observe during the run.

The Active Threads panel climbs as the ramp-up phase runs.

The Response Time panel shows p50, p90, and p95 percentiles updating every 15 seconds (the Prometheus scrape interval).

The Error Rate panel spikes if assertions start failing.

Personal observation: The 15-second scrape interval means you will not catch sub-second spikes in the Grafana view. If you need finer granularity, lower the scrape_interval in prometheus.yml to 5s. Just be aware this increases Prometheus storage usage over long runs.


## Practical Tips for Observability Teams
Here are things I have learned from running this setup in real projects.

1. Always use named test runs.
If you run multiple tests against the same Prometheus instance, the metrics will blend together. Use JMeter properties to tag your run and expose it as a label. This way you can filter by run in Grafana.

2. Persist Prometheus data with volume mounts.
The docker-compose.yml above already does this via prometheus_data. Without it, every docker compose down wipes your history.

3. Set Grafana alerts on the error rate panel.
The whole point of this setup is to catch problems early. Configure a Grafana alert on the error rate panel to fire when the error rate exceeds your SLA threshold (e.g. 1%).

4. Watch your label cardinality.
Prometheus stores a separate time series for every unique label combination. If you expose a dynamic URL path (e.g. /user/12345) as a label, you will create thousands of unique series and blow up Prometheus memory. Always normalize dynamic values before using them as labels.

5. For CI/CD pipelines, use Docker Compose in detached mode.
Spin up the stack before the test, run the test, export Prometheus snapshots or Grafana report URLs as build artifacts, then tear down.

```bash
docker compose up -d
jmeter -n -t test-plan.jmx -l results.jtl
docker compose down
```

## Troubleshooting Common Issues
Here are the most common problems I have seen (and fixed).

### Prometheus target shows as DOWN

Check that JMeter is actually running the test. The /metrics endpoint only exists while a test is active.
Confirm the IP binding. If prometheus.ip is 127.0.0.1, Prometheus inside Docker cannot reach it. Change it to 0.0.0.0.

### No data appearing in Grafana

Check the Prometheus data source connection in Grafana. The URL must be http://prometheus:9090 when both are in the same Docker Compose network.
Verify the Prometheus target is UP before checking Grafana.

### Backend Listener implementation not showing in dropdown

The JAR is in the wrong folder. It must be in `lib/ext/`, not `lib/`.
JMeter was not restarted after copying the JAR.

### Plugin JAR version mismatch

Check the plugin's GitHub README for the JMeter version compatibility matrix. Using a JAR built for JMeter 5.4 with JMeter 5.6 can cause class loader errors.

### host.docker.internal not resolving on Linux

Add `extra_hosts: ["host.docker.internal:host-gateway"]` to the Prometheus service in your Docker Compose file.

## Wrapping Up

In this blog post, we set up end-to-end real-time visibility for JMeter tests using the Prometheus Backend Listener plugin and a Grafana dashboard running in Docker Compose.

Happy Testing!
