/**
 * Persist provider API keys to pi-native `auth.json`.
 *
 * Important: `ModelRuntime.setRuntimeApiKey` only stores keys in a **memory**
 * overlay (`RuntimeCredentials`) and does not write disk. Without writing
 * auth.json, custom-model / settings keys vanish whenever the Agent Host
 * restarts — the Auth page then shows “未配置”.
 *
 * Format matches pi docs/providers.md:
 *   { "provider": { "type": "api_key", "key": "..." } }
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const AUTH_FILE = "auth.json";

export function authJsonPath(agentDir: string): string {
  return join(agentDir, AUTH_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readAuthFile(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

async function writeAuthFile(path: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await chmod(path, 0o600);
  } catch {
    // Windows may ignore mode; ignore chmod failures.
  }
}

/** Write or replace a provider API key in auth.json (durable). */
export async function persistProviderApiKey(
  agentDir: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const providerId = provider.trim();
  const key = apiKey.trim();
  if (!providerId) throw new Error("Provider is required");
  if (!key) throw new Error("API key is required");

  await mkdir(agentDir, { recursive: true });
  const path = authJsonPath(agentDir);
  const data = await readAuthFile(path);
  data[providerId] = { type: "api_key", key };
  await writeAuthFile(path, data);
}

/** Remove a provider credential from auth.json (if present). */
export async function deleteProviderCredential(agentDir: string, provider: string): Promise<void> {
  const providerId = provider.trim();
  if (!providerId) return;

  const path = authJsonPath(agentDir);
  const data = await readAuthFile(path);
  if (!(providerId in data)) return;
  delete data[providerId];
  await writeAuthFile(path, data);
}
