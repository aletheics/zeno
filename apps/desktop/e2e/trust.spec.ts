/**
 * Project trust E2E (view / chat mode).
 *
 * Zeno does not show an interactive "Trust project?" modal in view mode.
 * `defaultProjectTrust` only affects auto-trust when a project has trust-gated
 * resources (e.g. `.pi/settings.json`) and no trust.json entry yet:
 *   - always → projectTrusted true
 *   - never / ask → projectTrusted false until trust.set(true)
 * Projects without gated resources are always treated as trusted.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, startHost, test } from "./fixtures.ts";

type DefaultTrust = "ask" | "always" | "never";

async function setDefaultProjectTrust(page: Page, value: DefaultTrust): Promise<void> {
  const result = await page.evaluate(async (trust) => {
    try {
      const patched = await window.zeno.settings.patch({ defaultProjectTrust: trust });
      return { ok: true as const, value: patched.settings.defaultProjectTrust };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, value);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) expect(result.value).toBe(value);
}

async function openProject(
  page: Page,
  cwd: string,
): Promise<{
  cwd: string;
  projectTrusted: boolean;
  trustRequired: boolean | undefined;
  trustFallback: string | undefined;
  savedDecision: boolean | null | undefined;
}> {
  const result = await page.evaluate(async (path) => {
    try {
      const snap = await window.zeno.workspace.openPath(path, { resumeRecent: false });
      return {
        ok: true as const,
        cwd: snap.cwd,
        projectTrusted: snap.projectTrusted,
        trustRequired: snap.trust?.required,
        trustFallback: snap.trust?.fallback,
        savedDecision: snap.trust?.savedDecision,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, cwd);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(result.error);
  // openPath returns the host snapshot; renderer also receives host.ready/restarted.
  // Brief settle so React applies the event before dialog assertions.
  await page.waitForTimeout(500);
  return {
    cwd: result.cwd,
    projectTrusted: result.projectTrusted,
    trustRequired: result.trustRequired,
    trustFallback: result.trustFallback,
    savedDecision: result.savedDecision,
  };
}

async function hostSnapshotTrust(page: Page): Promise<{
  projectTrusted: boolean;
  required: boolean | undefined;
  fallback: string | undefined;
}> {
  return page.evaluate(async () => {
    const snap = await window.zeno.host.snapshot();
    return {
      projectTrusted: snap.projectTrusted,
      required: snap.trust?.required,
      fallback: snap.trust?.fallback,
    };
  });
}

async function createGatedProject(root: string, name: string): Promise<string> {
  const project = join(root, name);
  await mkdir(join(project, ".pi"), { recursive: true });
  await writeFile(join(project, ".pi", "settings.json"), "{}\n", "utf8");
  await writeFile(join(project, "README.md"), `${name}\n`, "utf8");
  return project;
}

test.describe("Project trust (view mode)", () => {
  test("always auto-trusts projects that have .pi config", async ({ page, zeno }) => {
    await startHost(page);
    await setDefaultProjectTrust(page, "always");

    const gated = await createGatedProject(zeno.root, "trust-always-gated");
    const opened = await openProject(page, gated);

    expect(opened.cwd.replace(/\\/g, "/")).toBe(gated.replace(/\\/g, "/"));
    expect(opened.trustRequired).toBe(true);
    expect(opened.trustFallback).toBe("always");
    expect(opened.projectTrusted).toBe(true);

    await expect(page.getByTestId("trust-chip")).toContainText(/trusted|已信任/i, {
      timeout: 15_000,
    });
  });

  test("never keeps gated projects untrusted until toggled", async ({ page, zeno }) => {
    await startHost(page);
    await setDefaultProjectTrust(page, "never");

    const gated = await createGatedProject(zeno.root, "trust-never-gated");
    const opened = await openProject(page, gated);

    expect(opened.trustRequired).toBe(true);
    expect(opened.trustFallback).toBe("never");
    expect(opened.projectTrusted).toBe(false);
    await expect(page.getByTestId("trust-chip")).toContainText(/untrusted|未信任/i, {
      timeout: 15_000,
    });

    // Manual trust via IPC (same path as settings / full-access mapping).
    await page.evaluate(async () => {
      await window.zeno.trust.set(true);
    });
    await expect
      .poll(async () => (await hostSnapshotTrust(page)).projectTrusted, { timeout: 15_000 })
      .toBe(true);
    await expect(page.getByTestId("trust-chip")).toContainText(/trusted|已信任/i, {
      timeout: 15_000,
    });

    await page.evaluate(async () => {
      await window.zeno.trust.set(false);
    });
    await expect
      .poll(async () => (await hostSnapshotTrust(page)).projectTrusted, { timeout: 15_000 })
      .toBe(false);
    await expect(page.getByTestId("trust-chip")).toContainText(/untrusted|未信任/i, {
      timeout: 15_000,
    });
  });

  test("ask shows trust dialog and Trust persists for gated projects", async ({ page, zeno }) => {
    await startHost(page);
    await setDefaultProjectTrust(page, "ask");

    const gated = await createGatedProject(zeno.root, "trust-ask-gated");
    const opened = await openProject(page, gated);

    expect(opened.trustRequired).toBe(true);
    expect(opened.trustFallback).toBe("ask");
    expect(opened.projectTrusted).toBe(false);

    const dialog = page.getByTestId("project-trust-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("project-trust-dialog-path")).toContainText(/trust-ask-gated/i);

    await page.getByTestId("project-trust-dialog-trust").click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect
      .poll(async () => (await hostSnapshotTrust(page)).projectTrusted, { timeout: 15_000 })
      .toBe(true);
    await expect(page.getByTestId("trust-chip")).toContainText(/trusted|已信任/i, {
      timeout: 15_000,
    });

    // Re-open same project: saved decision → no dialog.
    await openProject(page, gated);
    await expect(page.getByTestId("project-trust-dialog")).toHaveCount(0);
    await expect
      .poll(async () => (await hostSnapshotTrust(page)).projectTrusted, { timeout: 15_000 })
      .toBe(true);
  });

  test("ask dialog Later dismisses without trusting; never does not show dialog", async ({
    page,
    zeno,
  }) => {
    await startHost(page);
    await setDefaultProjectTrust(page, "ask");

    const gatedLater = await createGatedProject(zeno.root, "trust-ask-later");
    await openProject(page, gatedLater);
    await expect(page.getByTestId("project-trust-dialog")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("project-trust-dialog-later").click();
    await expect(page.getByTestId("project-trust-dialog")).toBeHidden({ timeout: 10_000 });
    await expect
      .poll(async () => (await hostSnapshotTrust(page)).projectTrusted, { timeout: 10_000 })
      .toBe(false);

    // never → no dialog for a different gated project
    await setDefaultProjectTrust(page, "never");
    const gatedNever = await createGatedProject(zeno.root, "trust-never-no-dialog");
    await openProject(page, gatedNever);
    await expect
      .poll(async () => (await hostSnapshotTrust(page)).projectTrusted, { timeout: 15_000 })
      .toBe(false);
    await expect(page.getByTestId("project-trust-dialog")).toHaveCount(0);
  });

  // Note: "plain folder is never gated" is covered by unit tests (resolvePixProjectTrust).
  // On Windows, temp paths live under the real user profile; pi walks parents for
  // `.agents/skills`, so E2E cannot reliably assert trustRequired=false for temp dirs.

  test("developer trust-toggle flips chip for a gated untrusted project", async ({
    page,
    zeno,
  }) => {
    await startHost(page);
    await setDefaultProjectTrust(page, "never");

    const gated = await createGatedProject(zeno.root, "trust-toggle-gated");
    await openProject(page, gated);
    await expect(page.getByTestId("trust-chip")).toContainText(/untrusted|未信任/i, {
      timeout: 15_000,
    });

    await page.getByTestId("developer-summary").click();
    await page.getByTestId("trust-toggle").click();
    await expect(page.getByTestId("trust-chip")).toContainText(/trusted|已信任/i, {
      timeout: 15_000,
    });
    await expect
      .poll(async () => (await hostSnapshotTrust(page)).projectTrusted, { timeout: 15_000 })
      .toBe(true);
  });
});
