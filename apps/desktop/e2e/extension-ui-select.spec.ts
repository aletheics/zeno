/**
 * Extension UI select (#32): options from ui.select must appear as choosable rows.
 *
 * Installs a global extension that opens a select dialog on session_start,
 * reloads resources so the dialog fires after the shell has a runtimeId,
 * then asserts the desktop Command list renders every option.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, startHost, test } from "./fixtures.ts";

const SELECT_TITLE = "E2E select title";
const SELECT_OPTIONS = ["alpha choice", "beta choice", "gamma choice"];

async function installSelectExtension(agentDir: string): Promise<void> {
  const extensionsDir = join(agentDir, "extensions");
  await mkdir(extensionsDir, { recursive: true });
  await writeFile(
    join(extensionsDir, "e2e-select.ts"),
    `export default function (pi: any) {
  pi.on("session_start", (_event: unknown, ctx: any) => {
    // Fire-and-forget so session startup is not blocked on the dialog.
    void ctx.ui.select(${JSON.stringify(SELECT_TITLE)}, ${JSON.stringify(SELECT_OPTIONS)}, {
      timeout: 120_000,
    });
  });
}
`,
  );
}

test.describe("Extension UI select", () => {
  test("renders options from ui.select so the user can pick one", async ({ page, zeno }) => {
    await installSelectExtension(zeno.agentDir);
    await startHost(page);

    // Reload after host is ready so session_start runs with a known runtimeId
    // and the extension is definitely bound (cold start may race first bind).
    await page.evaluate(async () => {
      await window.zeno.runtime.reload();
    });

    const dialog = page.getByTestId("extension-ui-select-dialog");
    await expect(dialog).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("extension-ui-select-title")).toContainText(SELECT_TITLE);

    const list = page.getByTestId("extension-ui-select-options");
    await expect(list).toBeVisible();
    for (let i = 0; i < SELECT_OPTIONS.length; i++) {
      const option = page.getByTestId(`extension-ui-select-option-${i}`);
      await expect(option).toBeVisible();
      await expect(option).toContainText(SELECT_OPTIONS[i]!);
    }

    await page.getByTestId("extension-ui-select-option-1").click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
});
