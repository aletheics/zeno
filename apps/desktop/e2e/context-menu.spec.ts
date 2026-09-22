import type { Page } from "@playwright/test";
import { expect, sendPrompt, startHost, test } from "./fixtures.ts";

/**
 * Right-click menus.
 *
 * These are the app's own menus, never Chromium's — `AGENTS.md` forbids native menus for product
 * interaction — so the assertions are about *our* testids appearing and the action landing.
 *
 * The clipboard is replaced with a recorder, the same way `desktop.spec.ts` does it, so a run
 * neither reads nor clobbers the real system clipboard.
 */
async function recordClipboard(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { __copied?: string }).__copied = value;
        },
        readText: async () => (window as Window & { __pasted?: string }).__pasted ?? "",
      },
    });
  });
}

function copied(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as Window & { __copied?: string }).__copied);
}

test("Composer: right-click copies the selected prompt and clears it", async ({ page }) => {
  await startHost(page);
  await recordClipboard(page);

  const prompt = page.getByTestId("prompt-input");
  await prompt.fill("hello world");
  // Select all rather than a sub-range: a right-click lands somewhere inside the selection and
  // Chromium keeps it, whereas a partial selection collapses if the click misses it.
  await prompt.evaluate((el) => (el as HTMLTextAreaElement).select());

  await prompt.click({ button: "right" });

  await expect(page.getByTestId("composer-context-menu")).toBeVisible();
  // Cut/copy only exist while something is selected; select-all/clear only while there is text.
  await expect(page.getByTestId("composer-menu-cut")).toBeVisible();
  await expect(page.getByTestId("composer-menu-select-all")).toBeVisible();

  await page.getByTestId("composer-menu-copy").click();
  await expect.poll(() => copied(page)).toBe("hello world");
  await expect(page.getByTestId("composer-context-menu")).toBeHidden();

  await prompt.click({ button: "right" });
  await page.getByTestId("composer-menu-clear").click();
  await expect(prompt).toHaveValue("");
});

test("Composer: paste puts clipboard text at the caret", async ({ page }) => {
  await startHost(page);
  await recordClipboard(page);
  await page.evaluate(() => {
    (window as Window & { __pasted?: string }).__pasted = "PASTED";
  });

  const prompt = page.getByTestId("prompt-input");
  await prompt.fill("hello world");
  await prompt.evaluate((el) => (el as HTMLTextAreaElement).setSelectionRange(0, 5));

  await prompt.click({ button: "right" });
  await page.getByTestId("composer-menu-paste").click();

  await expect(prompt).toHaveValue("PASTED world");
});

test("Composer: Shift+F10 opens the same menu and Escape closes it", async ({ page }) => {
  await startHost(page);

  const prompt = page.getByTestId("prompt-input");
  await prompt.fill("draft");
  await prompt.press("Shift+F10");

  await expect(page.getByTestId("composer-context-menu")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("composer-context-menu")).toBeHidden();
});

test("Message row: right-click copies the message, plain text included", async ({ page }) => {
  await startHost(page);
  await recordClipboard(page);

  const sent = "Use the read tool for the fixture file.";
  await sendPrompt(page, sent);

  await page.locator('[data-kind="user"]').first().click({ button: "right" });

  await expect(page.getByTestId("timeline-context-menu")).toBeVisible();
  // A user turn can be edited and resend, but forking an assistant entry means nothing here.
  await expect(page.getByTestId("timeline-menu-edit")).toBeVisible();
  await expect(page.getByTestId("timeline-menu-fork")).toHaveCount(0);

  await page.getByTestId("timeline-menu-copy").click();
  await expect.poll(() => copied(page)).toBe(sent);
});

test("Message row: the assistant turn forks but does not offer edit", async ({ page }) => {
  await startHost(page);

  await sendPrompt(page, "Use the read tool for the fixture file.");

  await page.locator('[data-kind="assistant"]').first().click({ button: "right" });

  await expect(page.getByTestId("timeline-context-menu")).toBeVisible();
  await expect(page.getByTestId("timeline-menu-fork")).toBeVisible();
  await expect(page.getByTestId("timeline-menu-edit")).toHaveCount(0);
});
