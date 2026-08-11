/**
 * Enable env-based HTTP(S) proxy for undici/fetch used by pi / OpenAI SDK.
 * Must be imported before network calls. Relies on HTTP_PROXY/HTTPS_PROXY set by main.
 *
 * Sets NODE_USE_ENV_PROXY so Node/undici honor proxy env when supported.
 */
try {
  const hasProxy = Boolean(
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy,
  );
  if (hasProxy) {
    process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || "1";
    console.log("[agent-host] HTTP proxy env active (NODE_USE_ENV_PROXY=1)");
  }
} catch {
  // ignore bootstrap failures — network falls back to direct
}
