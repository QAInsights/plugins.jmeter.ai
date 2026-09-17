import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import java.net.HttpURLConnection
// NB: do not import org.apache.jmeter.samplers.SampleResult here — the JSR223
// sampler binds a variable named SampleResult (the current result instance),
// and the import would shadow it, breaking calls like SampleResult.latencyEnd().

def host = vars.get("LLM_HOST"); def port = vars.get("LLM_PORT")
def body = JsonOutput.toJson([
    model: vars.get("MODEL"),
    stream: true,
    max_tokens: vars.get("MAX_TOKENS") as int,
    messages: [[role: "user", content: vars.get("prompt")]]
])

SampleResult.setSampleLabel("POST /v1/chat/completions (stream)")
def url = new URL("http://${host}:${port}/v1/chat/completions")
HttpURLConnection conn = (HttpURLConnection) url.openConnection()
conn.setRequestMethod("POST")
conn.setDoOutput(true)
conn.setConnectTimeout(5000)
conn.setReadTimeout(60000)
conn.setRequestProperty("Content-Type", "application/json")
conn.setRequestProperty("Accept", "text/event-stream")
conn.setRequestProperty("Authorization", "Bearer " + (props.getProperty("llm.api.key") ?: "sk-dummy"))

SampleResult.setRequestHeaders(conn.getRequestProperties().toString())
SampleResult.setSamplerData(body)

long tSent = System.nanoTime()
conn.outputStream.withWriter("UTF-8") { it << body }

int status = conn.responseCode
def slurper = new JsonSlurper()
def text = new StringBuilder()
int tokens = 0
long tFirst = 0L, tPrev = 0L
def gaps = []

conn.inputStream.withReader("UTF-8") { reader ->
    String line
    while ((line = reader.readLine()) != null) {
        if (!line.startsWith("data:")) continue
        def payload = line.substring(5).trim()
        if (payload == "[DONE]") break
        long now = System.nanoTime()
        if (tFirst == 0L) { tFirst = now; SampleResult.latencyEnd() }
        def delta = slurper.parseText(payload)?.choices?.getAt(0)?.delta?.content
        if (delta) {
            tokens++
            text << delta
            if (tPrev != 0L) gaps << (now - tPrev) / 1_000_000d
            tPrev = now
        }
    }
}
long tLast = System.nanoTime()

double ttftMs = tFirst ? (tFirst - tSent) / 1_000_000d : -1
double totalMs = (tLast - tSent) / 1_000_000d
double genMs = tFirst ? (tLast - tFirst) / 1_000_000d : 0
double tps = genMs > 0 ? tokens / (genMs / 1000d) : 0
double itlP50 = gaps ? gaps.sort()[(int) (gaps.size() * 0.5)] : 0

SampleResult.setResponseCode(status.toString())
SampleResult.setResponseData(text.toString(), "UTF-8")
SampleResult.setResponseHeaders("ttft_ms=${ttftMs.round(1)}\ntokens=${tokens}\ntokens_per_sec=${tps.round(1)}\nitl_p50_ms=${itlP50.round(1)}")
SampleResult.setSuccessful(status == 200 && tokens > 0)
if (!SampleResult.isSuccessful()) SampleResult.setResponseMessage("HTTP ${status}, tokens=${tokens}")

vars.put("ttft_ms", ttftMs.round(1).toString())
vars.put("tokens", tokens.toString())
vars.put("tokens_per_sec", tps.round(1).toString())
vars.put("itl_p50_ms", itlP50.round(1).toString())
vars.put("total_ms", totalMs.round(1).toString())
log.info("TTFT=${ttftMs.round(1)}ms tokens=${tokens} tok/s=${tps.round(1)} ITL p50=${itlP50.round(1)}ms total=${totalMs.round(1)}ms")
