const encoder = new TextEncoder();

/**
 * Keep the human-interface request active while the declared steward completes
 * its semantic tool loop. Whitespace is valid before a JSON document, so the
 * existing browser response.json() contract remains unchanged.
 */
export function streamStewardResult(run, { intervalMs = 15_000 } = {}) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("\n"));
      const keepalive = setInterval(() => controller.enqueue(encoder.encode("\n")), intervalMs);
      Promise.resolve().then(run).then(
        result => controller.enqueue(encoder.encode(JSON.stringify(result))),
        error => controller.enqueue(encoder.encode(JSON.stringify({ code: error.code ?? "error", error: error.message })))
      ).finally(() => {
        clearInterval(keepalive);
        controller.close();
      });
    }
  });
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
