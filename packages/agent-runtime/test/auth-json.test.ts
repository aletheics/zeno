import { describe, expect, it } from "vite-plus/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authJsonPath, deleteProviderCredential, persistProviderApiKey } from "../src/auth-json.ts";

describe("auth.json persistence", () => {
  it("writes durable api_key credentials and can delete them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pix-auth-json-"));
    try {
      await persistProviderApiKey(dir, "XTJ", "sk-test-key");
      const raw = await readFile(authJsonPath(dir), "utf8");
      const data = JSON.parse(raw) as Record<string, { type: string; key: string }>;
      expect(data.XTJ).toEqual({ type: "api_key", key: "sk-test-key" });

      await persistProviderApiKey(dir, "other", "sk-2");
      await deleteProviderCredential(dir, "XTJ");
      const next = JSON.parse(await readFile(authJsonPath(dir), "utf8")) as Record<string, unknown>;
      expect(next.XTJ).toBeUndefined();
      expect(next.other).toEqual({ type: "api_key", key: "sk-2" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
