/**
 * Normalize custom-provider baseUrl so SDK path joining is correct whether the
 * user includes a trailing `/v1` (or full endpoint path) or not.
 *
 * Conventions (pi-ai / official SDKs):
 * - openai-completions / openai-responses: base ends with `/v1` (paths are
 *   `/chat/completions`, `/responses`). Bare host → append `/v1`. Custom path
 *   prefixes (`/openai`, `/api/v1`, …) are left alone.
 * - anthropic-messages: base must NOT end with `/v1` (SDK posts `/v1/messages`).
 * - mistral-conversations: same as Anthropic (SDK paths already include `/v1/…`).
 * - google-generative-ai: bare host → `/v1beta` (pi sets apiVersion empty when
 *   baseUrl is set).
 * - azure-openai-responses: Azure hosts → `/openai/v1` (mirrors pi-ai).
 * - openai-codex / google-vertex / bedrock: only trim trailing slashes; those
 *   adapters resolve their own path shapes.
 */

export type ProviderBaseUrlApi = string;

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}

function stripPathSuffix(pathname: string, suffix: string): string {
  if (pathname === suffix) return "";
  if (pathname.endsWith(suffix)) return pathname.slice(0, -suffix.length);
  return pathname;
}

function stripPathSuffixes(pathname: string, suffixes: readonly string[]): string {
  let path = pathname;
  for (const suffix of suffixes) {
    const next = stripPathSuffix(path, suffix);
    if (next !== path) return next;
  }
  return path;
}

function formatUrl(url: URL, pathname: string): string {
  const path = pathname && pathname !== "/" ? pathname : "";
  return `${url.origin}${path}${url.search}${url.hash}`;
}

/**
 * Canonical baseUrl for a pi custom-provider API type.
 * Invalid absolute URLs fall back to slash-trimming only.
 */
export function normalizeProviderBaseUrl(baseUrl: string, api: ProviderBaseUrlApi): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return stripTrailingSlashes(trimmed);
  }

  let path = stripTrailingSlashes(url.pathname || "");
  if (path === "/") path = "";

  const kind = api.trim();

  switch (kind) {
    case "anthropic-messages": {
      // SDK: baseURL + "/v1/messages"
      path = stripPathSuffixes(path, ["/v1/messages", "/messages", "/v1"]);
      break;
    }
    case "mistral-conversations": {
      // Mistral SDK paths already start with /v1/...
      path = stripPathSuffixes(path, ["/v1"]);
      break;
    }
    case "openai-completions": {
      // SDK: baseURL + "/chat/completions"
      path = stripPathSuffixes(path, [
        "/v1/chat/completions",
        "/chat/completions",
        "/v1/completions",
        "/completions",
      ]);
      if (!path) path = "/v1";
      break;
    }
    case "openai-responses": {
      // SDK: baseURL + "/responses"
      path = stripPathSuffixes(path, ["/v1/responses", "/responses"]);
      if (!path) path = "/v1";
      break;
    }
    case "google-generative-ai": {
      // pi: baseUrl includes version; apiVersion forced to ""
      path = stripPathSuffixes(path, ["/v1beta/models", "/v1/models", "/v1beta", "/v1"]);
      // Custom path prefixes (not just a version segment) are preserved.
      if (!path) path = "/v1beta";
      break;
    }
    case "azure-openai-responses": {
      // Mirror pi-ai normalizeAzureBaseUrl for first-party Azure hosts.
      const host = url.hostname.toLowerCase();
      const isAzureHost =
        host.endsWith(".openai.azure.com") ||
        host.endsWith(".cognitiveservices.azure.com") ||
        host.endsWith(".ai.azure.com");
      if (path === "/openai/v1/responses") path = "/openai/v1";
      if (isAzureHost && (path === "" || path === "/openai" || path === "/openai/v1/responses")) {
        path = "/openai/v1";
        url.search = "";
      }
      break;
    }
    case "openai-codex-responses":
    case "google-vertex":
    case "bedrock-converse-stream":
    default:
      // Adapter-specific path resolution; only normalize trailing slashes.
      break;
  }

  return formatUrl(url, path);
}
