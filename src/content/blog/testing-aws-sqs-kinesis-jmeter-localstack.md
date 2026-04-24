---
title: "Testing AWS SQS and Kinesis with JMeter + LocalStack"
description: "Run Your Entire AWS Test Environment Locally — Zero Cloud Costs"
pubDate: 2026-04-24T12:00:00Z
author: "NaveenKumar Namachivayam"
image: "../../assets/blog/placeholder.png"
imageAlt: "Testing AWS SQS and Kinesis with JMeter + LocalStack"
tags: ["JMeter", "AWS", "LocalStack", "SQS", "Kinesis"]
featured: false
---

# Testing AWS SQS and Kinesis with JMeter + LocalStack

## Run Your Entire AWS Test Environment Locally — Zero Cloud Costs

---

## What Is LocalStack?

**LocalStack** is an open-source tool that emulates AWS cloud services entirely on your local machine. Instead of making real API calls to AWS, your applications and tests hit a **local endpoint** (`http://localhost:4566`) that behaves just like AWS.

Think of it as a **mock AWS environment** running in Docker — fully offline, completely free, and incredibly fast for development and testing.

### Why Use LocalStack for JMeter Testing?

| Benefit | Real AWS | LocalStack |
|--------|----------|------------|
| Cost | Paid per request | Free |
| Setup time | Minutes | Seconds |
| Internet required | Yes | No |
| Data privacy | Cloud-stored | Fully local |
| CI/CD friendly | Requires credentials | No credentials needed |
| Speed | Network latency | Near-zero latency |
| Realistic throttling | Yes | Configurable |

LocalStack is **ideal for**:
- Development and unit testing
- CI/CD pipeline validation
- Demos and workshops
- Exploratory testing without AWS costs

It's **not ideal for**:
- Final production load benchmarks (use real AWS for that)
- Testing actual AWS throttling behavior
- Multi-region scenarios

---

## Step 1: Install LocalStack

### Prerequisites

- **Docker** installed and running — https://www.docker.com/
- **Python 3.7+** (for the LocalStack CLI)
- **AWS CLI** installed (used to interact with LocalStack)

---

### Option A: Install via pip (Recommended)

```bash
pip install localstack
pip install awscli-local  # LocalStack-aware AWS CLI wrapper
```

Verify installation:

```bash
localstack --version
awslocal --version
```

---

### Option B: Run Directly via Docker

No installation needed — just pull and run:

```bash
docker run --rm -it \
  -p 4566:4566 \
  -p 4510-4559:4510-4559 \
  localstack/localstack
```

---

### Option C: Docker Compose (Best for Teams)

Create a `docker-compose.yml` file:

```yaml
version: "3.8"

services:
  localstack:
    container_name: localstack
    image: localstack/localstack:latest
    ports:
      - "127.0.0.1:4566:4566"
      - "127.0.0.1:4510-4559:4510-4559"
    environment:
      - SERVICES=sqs,kinesis
      - DEFAULT_REGION=us-east-1
      - DEBUG=1
      - DATA_DIR=/tmp/localstack/data
    volumes:
      - "./localstack-data:/tmp/localstack/data"
      - "/var/run/docker.sock:/var/run/docker.sock"
```

Start it:

```bash
docker-compose up -d
```

Check it's running:

```bash
curl http://localhost:4566/_localstack/health
```

You should see:

```json
{
  "services": {
    "sqs": "running",
    "kinesis": "running"
  },
  "version": "x.x.x"
}
```

---

## Step 2: Configure AWS CLI for LocalStack

LocalStack accepts **any** fake credentials — it doesn't validate them. Configure a dedicated profile:

```bash
aws configure --profile localstack
```

Enter these values:

```
AWS Access Key ID:     test
AWS Secret Access Key: test
Default region name:   us-east-1
Default output format: json
```

From now on, use `--profile localstack --endpoint-url http://localhost:4566` with every CLI command.

Or use **`awslocal`** (the LocalStack CLI wrapper) which does this automatically:

```bash
awslocal sqs list-queues
awslocal kinesis list-streams
```

---

## Step 3: Create SQS and Kinesis Resources Locally

### Create SQS Queue

```bash
# Standard queue
awslocal sqs create-queue --queue-name jmeter-local-queue

# FIFO queue
awslocal sqs create-queue \
  --queue-name jmeter-local-queue.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true
```

Get the queue URL:

```bash
awslocal sqs get-queue-url --queue-name jmeter-local-queue
```

Output:
```json
{
  "QueueUrl": "http://localhost:4566/000000000000/jmeter-local-queue"
}
```

---

### Create Kinesis Stream

```bash
awslocal kinesis create-stream \
  --stream-name jmeter-local-stream \
  --shard-count 2

# Verify it's active
awslocal kinesis describe-stream \
  --stream-name jmeter-local-stream \
  --query 'StreamDescription.StreamStatus'
```

---

## Step 4: Configure JMeter to Point to LocalStack

This is the **key step** — you need to tell the JMeter AWS plugin to use LocalStack's endpoint instead of real AWS.

### 4.1 — Update User Defined Variables

In your JMeter test plan, update the **User Defined Variables** config:

| Variable | Real AWS Value | LocalStack Value |
|----------|---------------|-----------------|
| `AWS_ACCESS_KEY` | Your real key | `test` |
| `AWS_SECRET_KEY` | Your real secret | `test` |
| `AWS_REGION` | `us-east-1` | `us-east-1` |
| `AWS_ENDPOINT_URL` | *(empty)* | `http://localhost:4566` |
| `SQS_QUEUE_URL` | Real SQS URL | `http://localhost:4566/000000000000/jmeter-local-queue` |
| `KINESIS_STREAM` | Real stream name | `jmeter-local-stream` |

---

### 4.2 — Configure the Plugin Endpoint

Most AWS JMeter plugins have an **Endpoint URL** or **Custom Endpoint** field in the sampler. Set it to:

```
http://localhost:4566
```

If your plugin doesn't have a GUI field for the endpoint, you can configure it via the **AWS SDK system property** in JMeter's startup:

Edit `bin/jmeter` (Linux/Mac) or `bin/jmeter.bat` (Windows) and add:

```bash
JVM_ARGS="-Daws.sqs.endpoint=http://localhost:4566 \
           -Daws.kinesis.endpoint=http://localhost:4566"
```

Or pass it at startup:

```bash
./bin/jmeter \
  -Daws.sqs.endpoint=http://localhost:4566 \
  -Daws.kinesis.endpoint=http://localhost:4566
```

---

### 4.3 — Using JSR223 Sampler with LocalStack Endpoint

If you're using Groovy scripts alongside the plugin, configure the endpoint override explicitly:

```groovy
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.regions.Region
import java.net.URI

def sqsClient = SqsClient.builder()
    .region(Region.US_EAST_1)
    .endpointOverride(new URI("http://localhost:4566"))
    .credentialsProvider(
        software.amazon.awssdk.auth.credentials.StaticCredentialsProvider.create(
            software.amazon.awssdk.auth.credentials.AwsBasicCredentials.create("test", "test")
        )
    )
    .build()
```

Same pattern for Kinesis:

```groovy
import software.amazon.awssdk.services.kinesis.KinesisClient
import software.amazon.awssdk.regions.Region
import java.net.URI

def kinesisClient = KinesisClient.builder()
    .region(Region.US_EAST_1)
    .endpointOverride(new URI("http://localhost:4566"))
    .credentialsProvider(
        software.amazon.awssdk.auth.credentials.StaticCredentialsProvider.create(
            software.amazon.awssdk.auth.credentials.AwsBasicCredentials.create("test", "test")
        )
    )
    .build()
```

---

## Step 5: Run the SQS Test Against LocalStack

With LocalStack running and JMeter configured, your test plan is **identical** to the real AWS version — just pointing at `localhost:4566`.

### Verify Messages Are Being Sent

After running your JMeter test, check the queue via CLI:

```bash
# Check queue depth
awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/jmeter-local-queue \
  --attribute-names ApproximateNumberOfMessages

# Receive a sample message manually
awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/jmeter-local-queue \
  --max-number-of-messages 1
```

Expected output:

```json
{
  "Messages": [
    {
      "MessageId": "abc123...",
      "Body": "{\"eventType\":\"order_placed\",\"orderId\":\"uuid...\"}",
      "ReceiptHandle": "..."
    }
  ]
}
```

---

## Step 6: Run the Kinesis Test Against LocalStack

### Verify Records Are Ingested

```bash
# Get shard iterator
SHARD_ITERATOR=$(awslocal kinesis get-shard-iterator \
  --stream-name jmeter-local-stream \
  --shard-id shardId-000000000000 \
  --shard-iterator-type TRIM_HORIZON \
  --query 'ShardIterator' --output text)

# Read records
awslocal kinesis get-records \
  --shard-iterator $SHARD_ITERATOR \
  --limit 5
```

You should see your JMeter-generated records in the output.

---

## Step 7: Automate with a LocalStack Init Script

For CI/CD or team setups, automate resource creation with an **init script** that runs when LocalStack starts.

Create `localstack-init/init-aws.sh`:

```bash
#!/bin/bash

echo "🚀 Initializing LocalStack resources..."

# Create SQS queues
awslocal sqs create-queue --queue-name jmeter-local-queue
awslocal sqs create-queue \
  --queue-name jmeter-local-queue.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true

# Create Kinesis streams
awslocal kinesis create-stream \
  --stream-name jmeter-local-stream \
  --shard-count 2

echo "✅ LocalStack resources ready!"
```

Update `docker-compose.yml` to run it on startup:

```yaml
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - "127.0.0.1:4566:4566"
    environment:
      - SERVICES=sqs,kinesis
      - DEFAULT_REGION=us-east-1
    volumes:
      - "./localstack-init:/etc/localstack/init/ready.d"
      - "/var/run/docker.sock:/var/run/docker.sock"
```

Now every time LocalStack starts, your SQS queues and Kinesis streams are automatically created — no manual setup needed.

---

## Step 8: Integrate LocalStack + JMeter in CI/CD

This is where LocalStack truly shines. Run your entire AWS messaging test suite in **GitHub Actions**, **GitLab CI**, or **Jenkins** — no AWS credentials needed.

### GitHub Actions Example

```yaml
name: JMeter AWS Load Test (LocalStack)

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  load-test:
    runs-on: ubuntu-latest

    services:
      localstack:
        image: localstack/localstack:latest
        ports:
          - 4566:4566
        env:
          SERVICES: sqs,kinesis
          DEFAULT_REGION: us-east-1
        options: >-
          --health-cmd "curl -f http://localhost:4566/_localstack/health"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up Java
        uses: actions/setup-java@v3
        with:
          java-version: '11'
          distribution: 'temurin'

      - name: Download JMeter
        run: |
          wget https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-5.6.2.tgz
          tar -xzf apache-jmeter-5.6.2.tgz

      - name: Install AWS CLI Local
        run: pip install awscli-local

      - name: Wait for LocalStack
        run: |
          until curl -s http://localhost:4566/_localstack/health | grep '"sqs": "running"'; do
            echo "Waiting for LocalStack..."
            sleep 2
          done

      - name: Create AWS Resources
        run: |
          awslocal sqs create-queue --queue-name jmeter-local-queue
          awslocal kinesis create-stream \
            --stream-name jmeter-local-stream \
            --shard-count 2

      - name: Run JMeter Tests
        run: |
          ./apache-jmeter-5.6.2/bin/jmeter -n \
            -t tests/aws-localstack-test.jmx \
            -l results/results.jtl \
            -e -o results/html-report/ \
            -JAWS_ENDPOINT=http://localhost:4566 \
            -JAWS_ACCESS_KEY=test \
            -JAWS_SECRET_KEY=test \
            -JAWS_REGION=us-east-1

      - name: Upload JMeter Report
        uses: actions/upload-artifact@v3
        with:
          name: jmeter-html-report
          path: results/html-report/

      - name: Check Error Threshold
        run: |
          ERROR_RATE=$(grep -oP 'errorPct="\K[^"]+' results/results.jtl | tail -1)
          if (( $(echo "$ERROR_RATE > 1.0" | bc -l) )); then
            echo "❌ Error rate $ERROR_RATE% exceeds threshold!"
            exit 1
          fi
          echo "✅ Error rate $ERROR_RATE% is within threshold"
```

---

## Step 9: Switching Between LocalStack and Real AWS

The cleanest approach is a **JMeter property file** per environment.

Create `config/localstack.properties`:

```properties
AWS_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY=test
AWS_SECRET_KEY=test
AWS_REGION=us-east-1
SQS_QUEUE_URL=http://localhost:4566/000000000000/jmeter-local-queue
KINESIS_STREAM=jmeter-local-stream
```

Create `config/aws-staging.properties`:

```properties
AWS_ENDPOINT=
AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/staging-queue
KINESIS_STREAM=staging-stream
```

Run with the desired environment:

```bash
# LocalStack
./bin/jmeter -n -t test.jmx -q config/localstack.properties

# Staging AWS
./bin/jmeter -n -t test.jmx -q config/aws-staging.properties
```

**One test plan. Two environments. Zero code changes.** ✅

---

## Troubleshooting LocalStack

### Connection Refused on Port 4566

```bash
# Check if LocalStack is running
docker ps | grep localstack

# Check LocalStack logs
docker logs localstack
```

### Service Not Ready

```bash
# Wait for all services to be healthy
curl http://localhost:4566/_localstack/health | python3 -m json.tool
```

### Messages Not Appearing

```bash
# Verify queue exists
awslocal sqs list-queues

# Check queue attributes
awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/jmeter-local-queue \
  --attribute-names All
```

### Kinesis Stream Not Active

```bash
# Check stream status
awslocal kinesis describe-stream \
  --stream-name jmeter-local-stream
```

### Plugin Can't Connect to LocalStack

Make sure the plugin's endpoint field is set — some plugins default to the real AWS endpoint and ignore system properties. Check the plugin's documentation for the exact field name (`Custom Endpoint`, `Endpoint URL`, `Service Endpoint`).

---

## LocalStack Free vs Pro

| Feature | LocalStack Free | LocalStack Pro |
|---------|----------------|----------------|
| SQS | ✅ Full support | ✅ Full support |
| Kinesis | ✅ Basic support | ✅ Enhanced support |
| Persistence | ✅ Basic | ✅ Advanced |
| CloudWatch Metrics | ❌ | ✅ |
| Multi-region | ❌ | ✅ |
| CI/CD integrations | ✅ | ✅ |
| Price | Free | Paid |

For most JMeter testing use cases — including SQS and Kinesis — **the free tier is more than enough**.

---

## Conclusion

LocalStack transforms your JMeter AWS testing workflow by:

- 💰 **Eliminating AWS costs** during development and CI/CD runs
- ⚡ **Removing network latency** for faster test iterations
- 🔒 **Keeping test data local** — no sensitive data leaves your machine
- 🔁 **Enabling environment switching** with a single property file
- 🤖 **Powering CI/CD pipelines** with zero cloud credentials

The recommended workflow is:

```
LocalStack (Dev/CI) → Real AWS Staging → Real AWS Production
```

Build and validate your JMeter test plans on LocalStack, run final load benchmarks on real AWS staging, and you'll catch performance issues long before they reach production.
