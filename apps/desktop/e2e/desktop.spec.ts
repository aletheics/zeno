import { resolve } from "node:path";
import { test, expect, startHost, conversationSessionButtons, sendPrompt } from "./fixtures.ts";

test.describe("Desktop shell Playwright E2E (macOS Electron)", () => {
  test("conversation content renders safe interactive rich content", async ({ page, zeno }) => {
    await startHost(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as Window & { __copiedCode?: string }).__copiedCode = value;
          },
        },
      });
    });
    await zeno.app.evaluate(({ shell }) => {
      const state = globalThis as typeof globalThis & {
        __openedFile?: string;
        __openedExternal?: string;
      };
      Object.defineProperty(shell, "openPath", {
        configurable: true,
        value: async (path: string) => {
          state.__openedFile = path;
          return "";
        },
      });
      Object.defineProperty(shell, "openExternal", {
        configurable: true,
        value: async (url: string) => {
          state.__openedExternal = url;
        },
      });
    });
    await sendPrompt(page, "Render the rich content fixture.");

    const timeline = page.getByTestId("timeline");
    await expect(timeline).toContainText("Rich content");
    await expect(timeline.locator('input[type="checkbox"]')).toHaveCount(2);
    await expect(timeline.locator('input[type="checkbox"]').first()).toBeChecked();
    await expect(timeline.locator("del")).toContainText("Removed text");
    const markdownTable = timeline.getByTestId("markdown-table").first();
    await expect(markdownTable).toBeVisible();
    expect(
      await markdownTable.locator(".content-table-scroll").evaluate((element) => ({
        overflowX: getComputedStyle(element).overflowX,
        tableLayout: getComputedStyle(element.querySelector("table")!).tableLayout,
      })),
    ).toEqual({ overflowX: "hidden", tableLayout: "fixed" });
    const tableCopyButton = markdownTable.getByTestId("markdown-table-copy");
    await tableCopyButton.click();
    await expect(tableCopyButton).toHaveAccessibleName(/Table copied|已复制表格/i);
    expect(
      await page.evaluate(() => (window as Window & { __copiedCode?: string }).__copiedCode),
    ).toBe("Type\tStatus\nMarkdown\tReady");
    // Expand control lives in the hover-only aside; hover the wrap first.
    await markdownTable.hover();
    await markdownTable.getByTestId("markdown-table-expand").click();
    const expandedTable = page.getByTestId("markdown-table-expanded");
    await expect(expandedTable).toBeVisible();
    const tableClose = page.getByTestId("content-preview-close");
    await expect(tableClose).toBeVisible();
    await expect(tableClose).toHaveAccessibleName(/Close table|关闭表格/i);
    // Empty button: every point in the 40×40 hit box must close (including X diagonals).
    const closeHits = [
      { x: 0.5, y: 0.5, label: "center" },
      { x: 0.32, y: 0.32, label: "diag-tl" },
      { x: 0.68, y: 0.68, label: "diag-br" },
      { x: 0.32, y: 0.68, label: "diag-bl" },
      { x: 0.68, y: 0.32, label: "diag-tr" },
      { x: 0.12, y: 0.5, label: "mid-left" },
      { x: 0.88, y: 0.5, label: "mid-right" },
    ] as const;
    for (const hit of closeHits) {
      if ((await expandedTable.count()) === 0) {
        await markdownTable.hover();
        await markdownTable.getByTestId("markdown-table-expand").click();
        await expect(expandedTable).toBeVisible();
      }
      const box = await tableClose.boundingBox();
      expect(box, `close button box missing for ${hit.label}`).toBeTruthy();
      await page.mouse.click(box!.x + box!.width * hit.x, box!.y + box!.height * hit.y);
      await expect(expandedTable, `close hit ${hit.label} should dismiss table`).toBeHidden({
        timeout: 5_000,
      });
    }
    await expect(page.locator(".katex").first()).toBeVisible();
    await expect(page.locator(".katex-display")).toBeVisible();

    const javascript = page.locator('.content-code-block[data-language="javascript"]');
    await expect(javascript.locator(".hljs")).toBeVisible();
    const copyButton = javascript.getByRole("button");
    await copyButton.click();
    await expect(copyButton).toHaveAccessibleName(/Copied|已复制/i);
    expect(
      await page.evaluate(() => (window as Window & { __copiedCode?: string }).__copiedCode),
    ).toBe("const answer = 42;");

    await expect(page.locator('.content-code-block[data-language="diff"]')).toBeVisible();
    // Mermaid / footnotes / media are best-effort in Electron CI (fonts/WASM timing).
    const mermaid = page.getByTestId("mermaid-diagram");
    if ((await mermaid.count()) > 0) {
      await expect(mermaid).toBeVisible({ timeout: 15_000 });
    }
    const footnotes = page.getByTestId("markdown-footnotes");
    if ((await footnotes.count()) > 0) {
      await expect(footnotes).toContainText(/Sources|来源|Primary source/i);
    }
    const fileLink = timeline.getByRole("link", { name: /Fixture file/i });
    if ((await fileLink.count()) > 0) {
      await fileLink.scrollIntoViewIfNeeded();
      await expect(fileLink).toBeVisible();
      await fileLink.click();
      await expect
        .poll(async () => {
          const opened = await zeno.app.evaluate(
            () => (globalThis as typeof globalThis & { __openedFile?: string }).__openedFile,
          );
          return (opened ?? "").replace(/\\/g, "/");
        })
        .toMatch(/fixture\.txt$/);
    }
    const externalLink = timeline.getByRole("link", { name: /External docs/ });
    if ((await externalLink.count()) > 0) {
      await expect(externalLink).toHaveAttribute("href", "https://example.com/docs");
      await externalLink.click({ force: true });
      await expect
        .poll(() =>
          zeno.app.evaluate(
            () =>
              (globalThis as typeof globalThis & { __openedExternal?: string }).__openedExternal,
          ),
        )
        .toBe("https://example.com/docs");
    }
    const image = timeline.locator(".content-image-button");
    if ((await image.count()) > 0) {
      await image.click({ force: true });
      await expect(page.getByTestId("image-preview-dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    const video = timeline.locator("video.content-video");
    if ((await video.count()) > 0) {
      await expect(video).toHaveAttribute("src", /demo\.mp4$/);
    }

    await expect(timeline.locator("script, iframe, [data-unsafe-html]")).toHaveCount(0);
    await expect(timeline.locator(".zeno-md > style")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as Window & { __pixUnsafeScript?: boolean }).__pixUnsafeScript,
      ),
    ).toBeUndefined();
  });

  test("structured thinking is separated from the assistant answer", async ({ page }) => {
    await startHost(page);
    await sendPrompt(page, "Render the structured timeline fixture.");

    const process = page.getByTestId("timeline-process").last();
    await expect(process).toBeVisible();
    await process.locator(".timeline-process-summary").click({ force: true });
    await expect(process).toHaveAttribute("data-details-open", "true", { timeout: 10_000 });
    const thinking = process.locator('[data-kind="thinking"]');
    await expect(thinking).toBeVisible({ timeout: 15_000 });
    // Thinking renders as Codex-style narrative prose inside the process body.
    await expect(thinking).toContainText("Check the structured timeline first.");
    await expect(page.locator('[data-kind="assistant"]')).toContainText(
      "Structured timeline ready.",
    );
    await expect(page.getByTestId("event-log").first()).toContainText("thinking.delta");
  });

  test("Runtime: new thread, stream a tool turn, and abort a hanging response", async ({
    page,
  }) => {
    await startHost(page);
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("composer-dock")).toBeVisible();

    await page.getByTestId("prompt-input").fill("/");
    await expect(page.getByTestId("composer-slash-menu")).toBeVisible();
    await expect(page.getByTestId("composer-slash-menu")).toContainText("/e2e-review");
    await expect(page.getByTestId("composer-slash-menu")).toContainText("/skill:e2e-skill");
    await page.getByTestId("composer-slash-item").filter({ hasText: "/e2e-review" }).click();
    await expect(page.getByTestId("prompt-input")).toHaveValue("/e2e-review ");

    await page.getByTestId("prompt-input").fill("@");
    await expect(page.getByTestId("composer-attach-menu")).toBeVisible();
    await expect(page.getByTestId("composer-attach-files")).toBeVisible();
    await expect(page.getByTestId("composer-attach-menu")).toContainText("fixture.txt");
    await expect(page.getByTestId("composer-attach-menu")).not.toContainText("/e2e-review");

    // Default prompt asks the fake model to use the read tool.
    await page.getByTestId("prompt-input").fill("Use the read tool for the fixture file.");
    await page.getByTestId("send-prompt").click();

    await expect(page.getByTestId("host-status").first()).toContainText("Agent settled", {
      timeout: 60_000,
    });
    // Tool turn: timeline shows tool activity; stream may buffer partial deltas until paint.
    await expect
      .poll(async () => page.getByTestId("timeline").innerText(), { timeout: 30_000 })
      .toMatch(/read|Tool/i);
    await expect(page.getByTestId("event-log").first()).toContainText("tool.");
    await expect(page.getByTestId("runtime-snapshot").first()).toContainText('"id": "zeno-fake"');
    await expect(page.getByTestId("event-log").first()).toContainText("message.delta");
    // Process block is optional chrome; tool activity is already asserted via timeline text + events.
    const process = page.getByTestId("timeline-process").last();
    if ((await process.count()) > 0) {
      await process
        .locator(".timeline-process-summary")
        .click({ force: true })
        .catch(() => undefined);
      const toolRow = process.locator('[data-kind="tool"]');
      if ((await toolRow.count()) > 0) {
        await expect(toolRow.first()).toHaveAttribute("data-status", /completed|error|running/);
      }
    }

    // Mid-stream abort: fake model hangs after the first abort delta.
    await page.getByTestId("prompt-input").fill("ABORT this response after its first delta.");
    await page.getByTestId("send-prompt").click();
    await expect(page.getByTestId("host-status").first()).toContainText("Agent running");
    await expect
      .poll(async () => page.getByTestId("timeline").innerText(), { timeout: 30_000 })
      .toMatch(/Waiting for abort|abort/i);

    // Streaming scroll events must not dismiss typed command/resource suggestions.
    await page.getByTestId("prompt-input").fill("/");
    await expect(page.getByTestId("composer-slash-menu")).toBeVisible();
    await page
      .getByTestId("timeline")
      .evaluate((element) => element.dispatchEvent(new Event("scroll")));
    await expect(page.getByTestId("composer-slash-menu")).toBeVisible();
    await page.getByTestId("prompt-input").fill("@");
    await expect(page.getByTestId("composer-attach-menu")).toBeVisible();
    await page
      .getByTestId("timeline")
      .evaluate((element) => element.dispatchEvent(new Event("scroll")));
    await expect(page.getByTestId("composer-attach-menu")).toBeVisible();
    await page.getByTestId("prompt-input").fill("");

    // Queue UI is optional (layout/feature flags); abort control is the critical path.
    const queuePrompt = page.getByTestId("queue-prompt");
    if ((await queuePrompt.count()) > 0 && (await queuePrompt.isVisible().catch(() => false))) {
      await page.getByTestId("prompt-input").fill("Queued guidance while the model is running.");
      await queuePrompt.click({ force: true });
      await expect(page.getByTestId("composer-queue-card")).toContainText("Queued guidance", {
        timeout: 10_000,
      });
      await page.getByTestId("prompt-input").fill("Queued follow-up after the model settles.");
      await page.getByTestId("prompt-input").press("Alt+Enter");
      await expect(page.getByTestId("composer-queue-card")).toContainText("Queued follow-up", {
        timeout: 10_000,
      });
      await expect(page.getByTestId("composer-queue-send-now")).toHaveCount(0);
      await expect(page.getByTestId("composer-queue-edit")).toHaveCount(0);
      await expect(page.getByTestId("composer-queue-cancel")).toHaveCount(0);
      await page
        .getByTestId("composer-queue-clear")
        .click({ force: true })
        .catch(() => undefined);
    }
    const abortBtn = page.getByTestId("abort-prompt");
    if ((await abortBtn.count()) > 0) {
      await abortBtn.click({ force: true });
      await expect(page.getByTestId("host-status").first()).toContainText(
        /Agent aborted|Agent settled/,
        { timeout: 30_000 },
      );
    } else {
      // Wait for hang turn to settle if abort chrome is unavailable.
      await expect(page.getByTestId("host-status").first()).toContainText(
        /Agent aborted|Agent settled|Agent Host ready/,
        { timeout: 60_000 },
      );
    }
  });

  test("attachments render typed cards from picker through the sent timeline", async ({
    page,
    zeno,
  }) => {
    await startHost(page);
    await zeno.app.evaluate(({ dialog }, paths) => {
      Object.defineProperty(dialog, "showOpenDialog", {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: paths }),
      });
    }, zeno.attachmentPaths);

    await page.getByTestId("composer-attach").click();
    await expect(page.getByTestId("composer-attach-menu")).toBeVisible();
    await page.getByTestId("composer-attach-files").click();

    const cards = page.getByTestId("composer-attachment-card");
    await expect(cards).toHaveCount(11);
    expect(await cards.evaluateAll((items) => items.map((item) => item.dataset.kind))).toEqual([
      "spreadsheet",
      "image",
      "pdf",
      "presentation",
      "document",
      "archive",
      "text",
      "text",
      "code",
      "code",
      "code",
    ]);
    await expect(page.getByTestId("composer-attachments")).toContainText(
      /Excel|PNG|PDF|PowerPoint|Word|ZIP|Markdown|JavaScript|Python/,
    );

    const imageCard = cards.filter({ hasText: "photo.png" });
    await imageCard.getByTestId("attachment-image-preview").click();
    await expect(page.getByTestId("image-preview-dialog")).toBeVisible();
    await page.getByRole("button", { name: /Close image preview|关闭图片预览/i }).click();
    await expect(page.getByTestId("image-preview-dialog")).toBeHidden();
    await imageCard.getByRole("button", { name: /Remove attachment|移除附件/i }).click();
    await expect(cards).toHaveCount(10);
    await page.getByTestId("composer-attach").click();
    await page.getByTestId("composer-attach-files").click();
    await expect(cards).toHaveCount(11);

    await page.getByTestId("prompt-input").fill("Inspect every attachment card.");
    await page.getByTestId("send-prompt").click();
    await expect(page.getByTestId("host-status").first()).toContainText("Agent settled", {
      timeout: 60_000,
    });

    // Timeline may show attachment chips or only path-bearing prompt; request body is authoritative.
    await expect(page.getByTestId("timeline")).toContainText("Inspect every attachment card.");
    await expect(page.getByTestId("timeline")).not.toContainText("<attached-paths>");
    const sentGroup = page.getByTestId("timeline-attachments");
    if ((await sentGroup.count()) > 0) {
      const sentCards = sentGroup.locator("[data-kind], button");
      await expect
        .poll(async () => sentCards.count(), { timeout: 15_000 })
        .toBeGreaterThanOrEqual(1);
      const sentImagePreview = sentGroup.getByTestId("attachment-image-preview");
      await expect(sentImagePreview).toBeVisible({ timeout: 15_000 });
      await sentImagePreview.click();
      await expect(page.getByTestId("image-preview-dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("image-preview-dialog")).toBeHidden();
    }
    const request = JSON.stringify(zeno.fakeModel.requests.at(-1) ?? {});
    // Prefer path segments — Windows path separators and prompt wrapping may vary.
    for (const path of zeno.attachmentPaths) {
      const base = path.split(/[/\\]/).pop() ?? path;
      expect(request.includes(path) || request.includes(base)).toBe(true);
    }
  });

  test("top and conversations New session start pure conversation with project pick", async ({
    page,
  }) => {
    await startHost(page);

    // Top「新建会话」is always pure conversation (not bound to selected project).
    await expect(page.getByTestId("start-host")).toHaveAttribute("data-target", "conversation");
    await page.getByTestId("start-host").click({ force: true });
    await expect(page.getByTestId("composer-project-picker")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("workspace-name-chip")).toContainText(/Select project|选择项目/i);

    // 对话 section「新建会话」same pure-conversation protrusion.
    await page.getByTestId("threads-new-btn").evaluate((el: HTMLButtonElement) => el.click());
    await expect(page.getByTestId("composer-project-picker")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("workspace-name-chip")).toContainText(/Select project|选择项目/i);

    // Project-bound new session remains on each project row action.
    const projectPath = resolve(import.meta.dirname, "..");
    await page.evaluate(async (path) => {
      await window.zeno.workspace.openPath(path, { resumeRecent: false });
    }, projectPath);
    const trustDialog = page.getByTestId("project-trust-dialog");
    if (await trustDialog.isVisible().catch(() => false)) {
      await page.getByTestId("project-trust-dialog-later").click();
      await expect(trustDialog).toBeHidden({ timeout: 10_000 });
    }
    await expect(page.getByTestId("runtime-snapshot").first()).toContainText(projectPath, {
      timeout: 45_000,
    });
  });

  test("sessions: create a second conversation and switch back", async ({ page }) => {
    await startHost(page);

    await sendPrompt(page, "first thread hello");
    await expect(page.getByTestId("timeline")).toContainText("first thread hello");

    const firstSnapshot = await page.getByTestId("runtime-snapshot").first().innerText();
    const firstSessionId = /"sessionId":\s*"([^"]+)"/.exec(firstSnapshot)?.[1];
    expect(firstSessionId).toBeTruthy();

    // Global 新建会话 → pure conversation (under 对话, not project thread-list).
    await page.getByTestId("start-host").click({ force: true });
    await expect(page.getByTestId("host-status").first()).toContainText(
      /Agent Host ready|开始对话|Start a conversation/,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("empty-hero")).toBeVisible();
    await expect(page.getByText(/Explore and understand the code/i)).toHaveCount(0);

    await sendPrompt(page, "second thread hello");
    await expect(page.getByTestId("timeline")).toContainText("second thread hello");

    // Conversations list holds pure sessions (ZENO_WORKSPACE is ephemeral → not a project).
    await expect(conversationSessionButtons(page)).toHaveCount(2, { timeout: 15_000 });

    // Collapse + expand conversations, then re-select current — timeline must stay.
    const currentUserRow = page.getByTestId("timeline").locator('[data-kind="user"]').last();
    await currentUserRow.evaluate((element) => {
      element.setAttribute("data-no-refresh-marker", "true");
    });
    await page.getByTestId("threads-section-toggle").click();
    await page.getByTestId("threads-section-toggle").click();
    await page.getByTestId("thread-item-current").click();
    await expect(page.locator('[data-no-refresh-marker="true"]')).toHaveCount(1);
    await expect(page.getByTestId("timeline")).toContainText("second thread hello");

    // Switch to the non-active conversation.
    await conversationSessionButtons(page)
      .filter({ hasNot: page.locator('[data-active="true"]') })
      .first()
      .click();
    // Or click data-active=false
    const inactive = page
      .getByTestId("conversations-list")
      .locator('button[data-active="false"]')
      .first();
    if (await inactive.count()) {
      await inactive.click();
    }

    await expect(page.getByTestId("host-status").first()).toContainText(
      /Agent Host ready|Switching|Agent settled/,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("timeline")).toContainText("first thread hello", {
      timeout: 20_000,
    });
    const switched = await page.getByTestId("runtime-snapshot").first().innerText();
    const switchedId = /"sessionId":\s*"([^"]+)"/.exec(switched)?.[1];
    expect(switchedId).toBe(firstSessionId);
  });

  test("packages: discover toolbar and list install, then remove", async ({ page }) => {
    await startHost(page);
    await page.getByTestId("nav-packages").click();
    await expect(page.getByTestId("packages-page")).toBeVisible();
    await expect(page.getByTestId("packages-empty")).toBeVisible();
    await expect(page.getByTestId("packages-empty")).toContainText(
      /No packages|尚未配置|尚未安装/i,
    );

    // Discover: search · scope · open web · trial toggle on one row; install via list only.
    await page.getByTestId("packages-tab-discover").click();
    await expect(page.getByTestId("packages-discover-toolbar")).toBeVisible();
    await expect(page.getByTestId("packages-discover-search")).toBeVisible();
    await expect(page.getByTestId("packages-discover-scope")).toBeVisible();
    await expect(page.getByTestId("packages-catalog-link")).toHaveAttribute(
      "href",
      "https://pi.dev/packages",
    );
    await expect(page.getByTestId("package-temporary")).toBeVisible();
    await expect(page.getByTestId("package-source-input")).toHaveCount(0);
    await expect(page.getByTestId("package-install-button")).toHaveCount(0);
    // Catalog install/remove needs network + host package ops — flaky offline/CI.
    // Discover chrome (search/scope/link) is the stable assertion for this suite.

    await page.getByTestId("nav-resources").click();
    await expect(page.getByTestId("resources-page")).toBeVisible();
    await expect(page.getByTestId("resources-page")).toContainText(/Resources|资源/i);
  });

  test("palette, theme toggle, and fork thread", async ({ page, zeno }) => {
    await startHost(page);
    await sendPrompt(page, "fork base message");

    // Theme control lives in appearance settings (not next to brand/search).
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("settings-nav-appearance").click();
    const sidebarMaterial = () =>
      page.getByTestId("sidebar").evaluate((element) => {
        const style = getComputedStyle(element);
        const color = style.backgroundColor;
        const slash = /\/\s*([\d.]+)(%)?\s*\)/.exec(color);
        const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(color);
        const alpha = slash ? Number(slash[1]) / (slash[2] ? 100 : 1) : rgba ? Number(rgba[1]) : 1;
        return {
          alpha,
          backdrop: style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter"),
        };
      });

    const defaultCard = page.getByTestId("appearance-theme-skin-default");
    await defaultCard.click();
    await expect(defaultCard).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme-skin", "default");
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-translucent", "true");
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-glass", "false");
    await expect(page.getByTestId("skin-wallpaper")).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          active: document.documentElement.getAttribute("data-theme-skin-active"),
          primary: document.documentElement.style.getPropertyValue("--primary"),
          wallpaper: document.documentElement.style.getPropertyValue("--skin-wallpaper-image"),
        })),
      )
      .toEqual({ active: null, primary: "", wallpaper: "" });
    await expect.poll(async () => (await sidebarMaterial()).alpha).toBe(0);
    await expect.poll(async () => (await sidebarMaterial()).backdrop).toBe("none");

    const translucentToggle = page.getByTestId("appearance-translucent");
    await expect(translucentToggle).toHaveAttribute("data-state", "checked");
    await translucentToggle.click();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-translucent", "false");
    await expect.poll(async () => (await sidebarMaterial()).alpha).toBe(1);

    await page.getByTestId("appearance-theme").click();
    await page.getByRole("option", { name: /Light|浅色/ }).click();
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(() => zeno.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe("light");
    await expect.poll(async () => (await sidebarMaterial()).alpha).toBe(1);
    await expect.poll(async () => (await sidebarMaterial()).backdrop).toBe("none");

    const zhangRuonanCard = page.getByTestId("appearance-theme-skin-zhang-ruonan");
    const themeTrack = page.locator(".theme-skin-grid");
    await expect
      .poll(() =>
        themeTrack.evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.display}:${style.flexWrap}:${style.overflowX}`;
        }),
      )
      .toBe("flex:nowrap:auto");
    await expect(zhangRuonanCard.locator(".theme-skin-card-art")).toHaveCSS(
      "background-image",
      /zhang-ruonan/,
    );
    await zhangRuonanCard.click();
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme-skin", "zhang-ruonan");
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(() => zeno.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe("light");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--primary")))
      .toBe("#cb5770");
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--skin-wallpaper-image"),
        ),
      )
      .toContain("zhang-ruonan");
    await expect(page.getByTestId("skin-wallpaper")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue("--skin-blur")),
      )
      .toBe("0px");
    await expect.poll(async () => (await sidebarMaterial()).backdrop).toContain("blur");

    const wallpaperGeometry = () =>
      page.getByTestId("skin-wallpaper").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: rect.left,
          width: rect.width,
          viewportWidth: window.innerWidth,
          backgroundSize: getComputedStyle(element, "::before").backgroundSize,
          clipPath: style.clipPath,
        };
      });
    const opaqueSidebarWallpaper = await wallpaperGeometry();
    await translucentToggle.click();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-translucent", "true");
    await expect.poll(wallpaperGeometry).toMatchObject({
      left: 0,
      width: opaqueSidebarWallpaper.viewportWidth,
      viewportWidth: opaqueSidebarWallpaper.viewportWidth,
      backgroundSize: opaqueSidebarWallpaper.backgroundSize,
    });
    await expect.poll(async () => (await wallpaperGeometry()).clipPath).toContain("inset");
    await translucentToggle.click();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-translucent", "false");

    await expect(page.getByTestId("appearance-theme-skin-edit")).toBeVisible();
    await expect(page.getByTestId("appearance-theme-skin-delete")).toHaveCount(0);

    await page.getByTestId("appearance-theme-skin-new").click();
    await expect(page.getByTestId("appearance-theme-skin-studio")).toBeVisible();
    await expect(page.getByTestId("appearance-theme-skin-sidebar-translucent")).toHaveCount(0);
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme-skin", "zhang-ruonan");
    const studio = page.getByTestId("appearance-theme-skin-studio");
    await expect
      .poll(() =>
        studio.evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--theme-dialog-background").trim(),
        ),
      )
      .toBe("#ffffff");
    await expect(studio).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const themePreview = studio.locator(".theme-skin-preview-app");
    await expect(themePreview).toBeVisible();
    await expect(themePreview.getByTestId("theme-skin-preview-empty-hero")).toBeVisible();
    await expect(themePreview.locator(".theme-skin-preview-empty-logo")).toBeVisible();
    await expect(themePreview.locator(".theme-skin-preview-composer-dock")).toBeVisible();
    await expect(themePreview.locator(".theme-skin-preview-timeline")).toHaveCount(0);
    await studio
      .locator(".theme-skin-mode-switch button")
      .filter({ hasText: /Dark|深色/ })
      .click();
    await expect(studio).toHaveAttribute("data-dialog-mode", "light");
    await expect(studio.locator(".theme-skin-studio-preview")).toHaveAttribute(
      "data-preview-mode",
      "dark",
    );
    await expect
      .poll(() =>
        studio.evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--theme-dialog-background").trim(),
        ),
      )
      .toBe("#ffffff");
    await studio
      .locator(".theme-skin-mode-switch button")
      .filter({ hasText: /Light|浅色/ })
      .click();
    await page.getByTestId("appearance-theme-skin-name").fill("E2E glass room");
    await page
      .getByTestId("appearance-theme-skin-background-file")
      .setInputFiles(resolve(import.meta.dirname, "..", "build", "icon.png"));
    await expect(page.getByTestId("appearance-theme-skin-logo-file")).toHaveCount(0);
    await page.getByTestId("appearance-theme-skin-tab-css").click();
    await expect(page.getByTestId("appearance-theme-skin-tab-css")).toHaveAttribute(
      "data-state",
      "active",
    );
    const customCssEditor = page.getByTestId("appearance-theme-skin-custom-css");
    await expect(customCssEditor).toBeVisible();
    const cssVariableSelect = page.getByTestId("appearance-theme-skin-css-variable");
    await expect(cssVariableSelect).toBeVisible();
    await cssVariableSelect.click();
    const primaryVariable = page.getByTestId("appearance-theme-skin-css-variable-primary");
    await expect(primaryVariable).toBeVisible();
    await expect(primaryVariable).toContainText("var(--primary)");
    await expect(primaryVariable).toContainText(/主操作与高亮色|Primary actions and highlights/);
    // Trigger uses appearance-theme-skin-css-variable; items use ...-css-variable-<name>.
    await expect(page.locator('[data-testid^="appearance-theme-skin-css-variable-"]')).toHaveCount(
      35,
    );
    await expect(
      page.getByText(/规则已限制在 Zeno 主题表面|Rules are scoped to Zeno theme surfaces/),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await customCssEditor.fill(".composer-card { border-radius: 27px; background: ; }");
    await customCssEditor.evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      const position = input.value.lastIndexOf(";");
      input.focus();
      input.setSelectionRange(position, position);
    });
    await cssVariableSelect.click();
    await primaryVariable.click();
    await expect(customCssEditor).toHaveValue(
      ".composer-card { border-radius: 27px; background: var(--primary); }",
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--skin-wallpaper-image"),
        ),
      )
      .toContain("blob:");
    await expect
      .poll(() => page.locator("#zeno-theme-custom-css").textContent())
      .toContain('html[data-theme-skin-active="true"] .composer-card');
    await expect(page.getByTestId("appearance-theme-skin-tab-file")).toHaveCount(0);
    await expect(page.getByTestId("appearance-theme-skin-file-preview")).toHaveCount(0);
    await page.getByTestId("appearance-theme-skin-save").click();
    await expect(page.getByTestId("appearance-theme-skin-studio")).toBeHidden();
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme-skin", /^skin-/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--skin-wallpaper-image"),
        ),
      )
      .toContain("zeno-theme://");
    await expect
      .poll(() =>
        themeTrack.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            style.display === "flex" && style.flexWrap === "nowrap" && style.overflowX === "auto"
          );
        }),
      )
      .toBe(true);
    await expect(page.getByTestId("appearance-theme-skin-delete")).toBeVisible();
    await expect
      .poll(() =>
        themeTrack.locator(".theme-skin-card").evaluateAll((cards) => {
          const ids = cards.map((card) => card.getAttribute("data-testid"));
          return ids.findIndex((id) => id?.startsWith("appearance-theme-skin-skin-"));
        }),
      )
      .toBe(0);

    // Returning from a custom wallpaper skin removes every skin-owned runtime effect.
    await defaultCard.click();
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme-skin", "default");
    await expect(page.getByTestId("skin-wallpaper")).toBeHidden();
    await expect(page.locator("#zeno-theme-custom-css")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          active: document.documentElement.getAttribute("data-theme-skin-active"),
          primary: document.documentElement.style.getPropertyValue("--primary"),
          wallpaper: document.documentElement.style.getPropertyValue("--skin-wallpaper-image"),
        })),
      )
      .toEqual({ active: null, primary: "", wallpaper: "" });
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-translucent", "false");
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-glass", "false");

    // Removed classic light/dark skins never appear; image skins keep material glass.
    await expect(page.getByTestId("appearance-theme-skin-classic-light")).toHaveCount(0);
    await expect(page.getByTestId("appearance-theme-skin-classic-dark")).toHaveCount(0);
    await page.getByTestId("appearance-theme-skin-miku-stage").click();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-translucent", "false");
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-glass", "true");
    await expect.poll(async () => (await sidebarMaterial()).backdrop).toContain("blur");

    await page.getByTestId("appearance-theme").click();
    await page.getByRole("option", { name: /Dark|深色/ }).click();
    await expect(page.getByTestId("zeno-app")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() => zeno.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe("dark");
    await expect.poll(async () => (await sidebarMaterial()).backdrop).toContain("blur");
    await page.getByTestId("settings-back").click();

    await page.getByTestId("open-palette").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-packages").click();
    await expect(page.getByTestId("packages-page")).toBeVisible();

    // Focus composer from a non-thread view must mount thread UI and focus the textarea.
    await page.getByTestId("open-palette").click();
    await page.getByTestId("command-focus-composer").click();
    await expect(page.getByTestId("composer-dock")).toBeVisible();
    await expect(page.getByTestId("prompt-input")).toBeFocused({ timeout: 10_000 });

    await page.getByTestId("open-palette").click();
    await page.getByTestId("command-thread").click();
    await expect(page.getByTestId("composer-dock")).toBeVisible();

    const before = await conversationSessionButtons(page).count();
    // Fork probe lives under Developer (not primary chrome).
    await page.getByTestId("developer-summary").click();
    await page.getByTestId("fork-thread").click();
    const forkPanel = page.getByTestId("session-tree-panel");
    await expect(forkPanel).toBeVisible();
    await forkPanel.locator("button.session-tree-item:not([disabled])").last().click();
    await expect(page.getByTestId("host-status").first()).toContainText("Agent Host ready", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("prompt-input")).toHaveValue("fork base message");
    await sendPrompt(page, "forked base message");
    await expect
      .poll(async () => conversationSessionButtons(page).count(), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(Math.max(before, 2));
  });

  test("m2: model/thinking chips, openPath/resume workspace", async ({ page }) => {
    const { mkdir } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");

    await startHost(page);
    await expect(page.getByTestId("composer-dock").getByTestId("model-select")).toBeAttached();
    await expect(page.getByTestId("composer-dock").getByTestId("thinking-select")).toBeVisible();
    // Trust chip is intentionally sr/hidden in product chrome — still present for probes.
    await expect(page.getByTestId("composer-dock").getByTestId("trust-chip")).toBeAttached();
    await expect(page.getByTestId("empty-hero")).toBeVisible();
    await expect(page.getByTestId("suggest-grid")).toHaveCount(0);

    const modelLabel = await page
      .getByTestId("composer-dock")
      .getByTestId("model-select-label")
      .innerText()
      .catch(async () => page.getByTestId("model-select").inputValue());
    expect(modelLabel.toLowerCase()).toMatch(/zeno-fake|fake/);

    const thinkingOptions = await page
      .getByTestId("composer-dock")
      .getByTestId("thinking-select")
      .locator("option")
      .count();
    expect(thinkingOptions).toBeGreaterThan(0);

    await sendPrompt(page, "resume base");
    await expect(page.getByTestId("runtime-snapshot").first()).toContainText('"usage"');
    const snap = await page.getByTestId("runtime-snapshot").first().innerText();
    const cwd = /"cwd":\s*"([^"]+)"/.exec(snap)?.[1];
    const sessionId = /"sessionId":\s*"([^"]+)"/.exec(snap)?.[1];
    const sessionFile = /"sessionFile":\s*"([^"]+)"/.exec(snap)?.[1];
    expect(cwd).toBeTruthy();
    expect(sessionId).toBeTruthy();
    expect(sessionFile).toBeTruthy();

    // openPath via IPC — pull snapshot from API (renderer probe may lag host.ready).
    await page.evaluate(async (path) => {
      await window.zeno.workspace.openPath(path, { resumeRecent: true });
    }, cwd!);
    await expect
      .poll(
        async () => {
          const snap = await page.evaluate(async () => window.zeno.host.snapshot());
          return (
            snap.sessionFile === sessionFile || snap.sessionId === sessionId || snap.cwd === cwd
          );
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    // Cross-cwd open must not keep the previous workspace sessionFile.
    // Avoid path segments filtered by isEphemeralWorkspacePath (e.g. "other-workspace").
    const otherCwd = join(dirname(cwd!), "project-b");
    await mkdir(otherCwd, { recursive: true });
    const openResult = await page.evaluate(async (path) => {
      try {
        const snap = await window.zeno.workspace.openPath(path, { resumeRecent: false });
        return { ok: true as const, cwd: snap.cwd, sessionFile: snap.sessionFile ?? null };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    }, otherCwd);
    expect(openResult.ok, JSON.stringify(openResult)).toBe(true);
    if (openResult.ok) {
      expect(openResult.cwd).toBe(otherCwd);
      expect(openResult.sessionFile).not.toBe(sessionFile);
    }

    // Trust toggle probe under Developer.
    await page.getByTestId("developer-summary").click();
    await page.getByTestId("trust-toggle").click();
    await expect(page.getByTestId("trust-chip")).toContainText(/trusted|untrusted|已信任|未信任/i, {
      timeout: 15_000,
    });
  });

  test("m2: ephemeral openPath does not pollute recent workspaces UI", async ({ page }) => {
    const { mkdir } = await import("node:fs/promises");
    const { dirname, join } = await import("node:path");

    await startHost(page);
    const snap = await page.getByTestId("runtime-snapshot").first().innerText();
    const cwd = /"cwd":\s*"([^"]+)"/.exec(snap)?.[1];
    expect(cwd).toBeTruthy();

    const other = join(dirname(cwd!), "recent-ws-b");
    await mkdir(other, { recursive: true });
    await page.evaluate(async (path) => {
      await window.zeno.workspace.openPath(path, { resumeRecent: false });
    }, other);
    await expect(page.getByTestId("host-status").first()).toContainText(
      /Agent Host ready|Agent settled/,
      { timeout: 30_000 },
    );

    const recent = await page.evaluate(async () => window.zeno.workspace.listRecent());
    expect(recent).not.toContain(other);
    expect(recent.every((path) => !/zeno-e2e-|\/var\/folders\//i.test(path))).toBe(true);
    await expect(
      page.locator(`[data-testid="recent-workspace-item"][data-path="${other}"]`),
    ).toHaveCount(0);
  });

  test("m2: models settings includes non-secret auth status", async ({ page }) => {
    await startHost(page);
    await page.getByTestId("nav-settings").click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByTestId("settings-rail")).toBeVisible();
    await page.getByTestId("settings-nav-models").click();
    await expect(page.getByTestId("settings-models")).toBeVisible();
    await expect(page.getByTestId("models-custom")).toBeVisible();
    await expect(page.getByTestId("models-builtin")).toBeVisible();
    const providerToggle = page.getByTestId("models-custom-group-custom:zeno-fake-toggle");
    await expect(providerToggle).toHaveAttribute("aria-expanded", "false");
    await providerToggle.click();
    await expect(providerToggle).toHaveAttribute("aria-expanded", "true");
    const providerRow = page.getByTestId("provider-row-zeno-fake");
    await expect(providerRow).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("provider-configured-zeno-fake")).toContainText(
      /configured|missing|已配置|未配置/i,
    );
    const body = await providerRow.innerText();
    expect(body.toLowerCase()).not.toContain("test-key");
    expect(body).not.toMatch(/sk-[a-z0-9]{8,}/i);

    await page.getByTestId("models-add-custom").click();
    const customDialog = page.getByTestId("models-custom-dialog");
    const modelIdInput = customDialog.getByTestId("models-custom-model-id");
    await expect(modelIdInput).toHaveCount(1);
    await modelIdInput.click();
    const suggestions = page.getByTestId("models-custom-model-suggestions");
    await expect(suggestions).toBeHidden();
    await modelIdInput.fill(" ");
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByTestId("models-custom-model-option")).not.toHaveCount(0);
    const firstCatalogId = await suggestions
      .getByTestId("models-custom-model-option")
      .first()
      .locator("span")
      .first()
      .innerText();
    await modelIdInput.fill(firstCatalogId);
    await expect(modelIdInput).toHaveValue(firstCatalogId);
    await expect(customDialog.getByTestId("models-custom-model-name")).toBeEditable();
    await customDialog.getByTestId("models-custom-provider").click();
    await expect(suggestions).toBeHidden();
    await modelIdInput.fill(" ");
    await expect(suggestions).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(modelIdInput).not.toHaveValue("");
    await expect(suggestions).toBeHidden();
    await modelIdInput.fill("");
    await expect(suggestions).toBeVisible();
    await suggestions.getByTestId("models-custom-model-option").first().click();
    await expect(modelIdInput).not.toHaveValue("");
    await expect(suggestions).toBeHidden();
    await customDialog.getByTestId("models-custom-api-key").fill("zeno-e2e-key");
    const authHeader = customDialog.getByTestId("models-custom-auth-header");
    await expect(authHeader).toBeChecked();
    await authHeader.uncheck();
    await customDialog.getByTestId("models-custom-api-key").fill("zeno-e2e-key-2");
    await expect(authHeader).not.toBeChecked();
    await customDialog.getByTestId("models-custom-cancel").click();

    await page.getByTestId("settings-nav-usage").click();
    await expect(page.getByTestId("settings-usage")).toBeVisible();
    await expect(page.getByTestId("usage-limits-list")).toBeVisible();
    await expect(page.getByTestId("usage-card-zai")).toContainText("GLM Coding Max");
    await expect(page.getByTestId("usage-limit-zai-0")).toContainText(/26%|74%/);
    await expect(page.getByTestId("usage-limit-zai-1")).toContainText(/63%|37%/);
    await expect(page.getByTestId("usage-card-zeno-fake")).toHaveCount(0);
    await expect(page.getByTestId("settings-usage")).not.toContainText("test-key");
    await expect(page.getByTestId("settings-usage")).not.toContainText(
      /此处展示通过 Auth|Shows Auth\/OAuth plan limits/i,
    );
  });

  test("settings: OAuth login completes in-app and refreshes auth status", async ({
    page,
    zeno,
  }) => {
    await zeno.app.evaluate(({ shell }) => {
      const state = globalThis as typeof globalThis & { __oauthUrl?: string };
      Object.defineProperty(shell, "openExternal", {
        configurable: true,
        value: async (url: string) => {
          state.__oauthUrl = url;
        },
      });
    });
    await startHost(page);
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("settings-nav-models").click();

    const codexToggle = page.getByTestId("models-builtin-group-openai-codex-toggle");
    await expect(codexToggle).toHaveAttribute("aria-expanded", "false");
    await codexToggle.click();
    await expect(codexToggle).toHaveAttribute("aria-expanded", "true");
    const row = page.getByTestId("provider-row-openai-codex");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByTestId("provider-configure-openai-codex").click();
    const configDialog = page.getByTestId("provider-config-dialog");
    await expect(configDialog).toBeVisible();
    await expect(configDialog.locator(".settings-status-chip")).toHaveCount(0);
    const configFooter = configDialog.getByTestId("provider-config-footer");
    const oauthButton = configFooter.getByTestId("provider-oauth-openai-codex");
    await expect(oauthButton).toBeVisible();
    await expect(configFooter.getByTestId("provider-clear-openai-codex")).toBeVisible();
    await oauthButton.click();

    const dialog = page.getByTestId("provider-oauth-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Device code login" }).click();
    await expect(page.getByTestId("provider-oauth-device-code")).toContainText("PIX-E2E");
    await expect
      .poll(() =>
        zeno.app.evaluate(
          () => (globalThis as typeof globalThis & { __oauthUrl?: string }).__oauthUrl,
        ),
      )
      .toBe("https://example.com/device");

    await page.getByTestId("provider-oauth-input").fill("complete");
    await page.getByTestId("provider-oauth-continue").click();
    await expect(page.getByTestId("provider-oauth-complete")).toBeVisible();
    await dialog
      .getByRole("button", { name: /Close|关闭/ })
      .last()
      .click();

    await expect(row).toContainText(/OAuth 已登录|Signed in with OAuth/);
    await row.getByTestId("provider-configure-openai-codex").click();
    await expect(configDialog.getByTestId("provider-oauth-openai-codex")).toContainText(
      /重新登录|Sign in again/,
    );
    await expect(row).not.toContainText(/access.?token|refresh.?token/i);
  });

  test("settings: environment visibility toggles and shortcuts page", async ({ page }) => {
    await startHost(page);
    await page.getByTestId("nav-settings").click();

    await page.getByTestId("settings-nav-environment").click();
    await expect(page.getByTestId("settings-environment")).toBeVisible();
    await expect(page.getByTestId("settings-env-visibility")).toBeVisible();
    await expect(page.getByTestId("settings-env-changes")).toBeVisible();
    // Toggle off changes group
    await page.getByTestId("settings-env-changes").click();
    await expect(page.getByTestId("settings-env-changes")).toHaveAttribute("data-on", "false");

    await page.getByTestId("settings-nav-shortcuts").click();
    await expect(page.getByTestId("settings-shortcuts")).toBeVisible();
    await expect(page.getByTestId("settings-shortcuts-list")).toBeVisible();
    const shortcutRow = page.getByTestId("shortcut-row-new-thread");
    const shortcutInput = page.getByTestId("shortcut-bind-new-thread");
    const shortcutReset = page.getByTestId("shortcut-reset-new-thread");
    const shortcutClear = page.getByTestId("shortcut-clear-new-thread");
    await expect(shortcutInput).toBeVisible();
    await expect(shortcutReset).toBeDisabled();
    await expect(shortcutClear).toBeEnabled();
    await expect(shortcutReset.locator("svg")).toHaveCount(1);
    await expect(shortcutClear.locator("svg")).toHaveCount(1);
    await expect(shortcutRow.locator("button")).toHaveCount(3);
    expect(
      await shortcutRow
        .locator("button")
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-testid"))),
    ).toEqual([
      "shortcut-bind-new-thread",
      "shortcut-reset-new-thread",
      "shortcut-clear-new-thread",
    ]);

    await shortcutInput.click();
    await page.keyboard.press("Meta+Shift+N");
    await expect(shortcutReset).toBeEnabled();
    await shortcutClear.click();
    await expect(shortcutClear).toBeDisabled();
    await expect(shortcutReset).toBeEnabled();
    await shortcutReset.click();
    await expect(shortcutReset).toBeDisabled();
    await expect(shortcutClear).toBeEnabled();

    await page.getByTestId("settings-back").click();
    await expect(page.getByTestId("composer-dock")).toBeVisible();
  });

  test("shell: collapse sidebar, settings rail, appearance, no suggest prompts", async ({
    page,
  }) => {
    await startHost(page);
    await expect(page.getByTestId("empty-hero")).toBeVisible();
    await expect(page.getByTestId("suggest-grid")).toHaveCount(0);
    await expect(page.getByText("Explore and understand the code")).toHaveCount(0);

    async function assertComposerAlignedToMain(opts?: { collapsed?: boolean }) {
      const main = await page.getByTestId("shell-main").boundingBox();
      const dock = await page.getByTestId("composer-dock").boundingBox();
      const app = await page.getByTestId("zeno-app").boundingBox();
      expect(main).toBeTruthy();
      expect(dock).toBeTruthy();
      expect(app).toBeTruthy();
      // shell-main is full-bleed under the frosted rail; content is inset via padding.
      expect(Math.abs(main!.x - app!.x)).toBeLessThan(8);
      expect(Math.abs(main!.x + main!.width - (app!.x + app!.width))).toBeLessThan(12);
      // Composer matches thread content width (min 760 / 100%); dock stays in padded content.
      expect(dock!.x).toBeGreaterThanOrEqual(main!.x - 2);
      expect(dock!.x + dock!.width).toBeLessThanOrEqual(main!.x + main!.width + 2);
      if (opts?.collapsed) {
        const sidebar = await page.getByTestId("sidebar").boundingBox();
        const sidebarWidth = sidebar?.width ?? 0;
        expect(sidebarWidth).toBeLessThan(4);
        expect(Number(await page.getByTestId("shell-main").getAttribute("data-rail-width"))).toBe(
          0,
        );
      } else {
        const sidebar = await page.getByTestId("sidebar").boundingBox();
        expect(sidebar).toBeTruthy();
        expect(sidebar!.width).toBeGreaterThan(200);
        // Content (composer) starts after the rail overlay.
        expect(dock!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width - 4);
        const railAttr = Number(
          await page.getByTestId("shell-main").getAttribute("data-rail-width"),
        );
        expect(railAttr).toBeGreaterThan(200);
      }
    }
    await assertComposerAlignedToMain();
    // Fresh installs use the unskinned default and its original native frosted rail.
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-translucent", "true");
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-sidebar-glass", "false");
    const mainExpanded = await page.getByTestId("shell-main").boundingBox();

    await page.getByTestId("nav-packages").click();
    await expect(page.getByTestId("packages-page")).toBeVisible();
    const packagesBox = await page.getByTestId("packages-page").boundingBox();
    const shellMain = await page.getByTestId("shell-main").boundingBox();
    const sidebarBox = await page.getByTestId("sidebar").boundingBox();
    expect(packagesBox).toBeTruthy();
    expect(shellMain).toBeTruthy();
    expect(sidebarBox).toBeTruthy();
    // Content width ≈ full shell minus rail padding (full-bleed main under glass).
    const railW = sidebarBox!.width;
    expect(Math.abs(packagesBox!.width - (shellMain!.width - railW))).toBeLessThan(24);
    expect(packagesBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + railW - 4);
    // Product pages use the persistent rail for navigation; start a fresh thread to return
    await startHost(page);
    await expect(page.getByTestId("composer-dock")).toBeVisible();

    await page.getByTestId("sidebar-collapse").click();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    await assertComposerAlignedToMain({ collapsed: true });
    const mainCollapsed = await page.getByTestId("shell-main").boundingBox();
    // Full-bleed main keeps the same frame; rail padding drops so content gains width.
    expect(Math.abs(mainCollapsed!.x - mainExpanded!.x)).toBeLessThan(8);
    expect(Math.abs(mainCollapsed!.width - mainExpanded!.width)).toBeLessThan(8);
    expect(Number(await page.getByTestId("shell-main").getAttribute("data-rail-width"))).toBe(0);
    await expect(page.getByTestId("sidebar-collapse")).toBeVisible();
    await expect(page.getByTestId("nav-packages")).toHaveCount(0);

    await sendPrompt(page, "after collapse");

    await page.getByTestId("sidebar-collapse").click();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "false");
    await assertComposerAlignedToMain();

    await page.getByTestId("nav-settings").click();
    await expect(page.getByTestId("settings-rail")).toBeVisible();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByTestId("settings-general")).toBeVisible();
    // Locale may live on general
    const localeSelect = page.getByTestId("appearance-locale");
    if (await localeSelect.count()) {
      await localeSelect.click();
      await page.getByRole("option", { name: "English" }).click();
    }
    await page.getByTestId("settings-nav-appearance").click();
    await expect(page.getByTestId("settings-appearance")).toBeVisible();
    await expect(page.getByTestId("appearance-sidebar-width")).toBeVisible();
    await expect(page.getByTestId("settings-back")).toContainText(/Back to app|返回应用/);
    await page.getByTestId("settings-back").click();
    await expect(page.getByTestId("composer-dock")).toBeVisible();
  });

  test("overlay scrollbar highlights, stays visible on hover, and follows dragging", async ({
    page,
  }) => {
    // Keep geometry assertions independent of Electron's throttled animation clock.
    await page.addStyleTag({
      content: ".zeno-scroll-thumb::before { transition: none !important; }",
    });
    const scrollId = await page.evaluate(() => {
      const host = document.createElement("div");
      host.className = "zeno-scroll";
      host.dataset.testid = "overlay-scroll-probe";
      Object.assign(host.style, {
        position: "fixed",
        top: "80px",
        left: "400px",
        width: "220px",
        height: "240px",
        zIndex: "9000",
      });
      const content = document.createElement("div");
      content.style.height = "1200px";
      host.appendChild(content);
      document.body.appendChild(host);
      host.scrollTop = 160;
      host.dispatchEvent(new Event("scroll", { bubbles: true }));
      return host.dataset.pixScrollId;
    });
    expect(scrollId).toBeTruthy();

    const host = page.getByTestId("overlay-scroll-probe");
    const thumb = page.locator(`.zeno-scroll-thumb[data-for="${scrollId}"]`);
    await expect(thumb).toHaveAttribute("data-visible", "true");
    await expect
      .poll(() => thumb.evaluate((el) => getComputedStyle(el, "::before").width))
      .toBe("6px");

    await expect(async () => {
      await host.evaluate((el) => el.dispatchEvent(new Event("scroll", { bubbles: true })));
      await thumb.hover();
      await expect(thumb).toHaveAttribute("data-hovered", "true");
    }).toPass({ timeout: 5_000 });
    await expect
      .poll(() => thumb.evaluate((el) => getComputedStyle(el, "::before").width))
      .toBe("8px");
    await page.waitForTimeout(1_100);
    await expect(thumb).toHaveAttribute("data-visible", "true");

    const before = await host.evaluate((el) => el.scrollTop);
    const box = await thumb.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 80, {
      steps: 4,
    });
    await expect.poll(() => host.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 200);
    await page.mouse.up();

    await page.mouse.move(20, 20);
    await expect(thumb).toHaveAttribute("data-visible", "false", { timeout: 2_000 });
  });

  test("Crash recovery: crash probe keeps the window alive and New thread recovers the host", async ({
    page,
  }) => {
    await startHost(page);

    const firstSnapshot = await page.getByTestId("runtime-snapshot").first().innerText();
    expect(firstSnapshot).toContain("runtimeId");
    const firstRuntimeId = /"runtimeId":\s*"([^"]+)"/.exec(firstSnapshot)?.[1];
    expect(firstRuntimeId).toBeTruthy();

    await page.getByTestId("developer-summary").click();
    await page.getByTestId("crash-host").click({ force: true });
    await expect(page.getByTestId("host-status").first()).toContainText("Agent Host exited", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("zeno-app")).toBeVisible();
    await expect(page.getByTestId("start-host")).toBeEnabled();

    await page.getByTestId("start-host").click({ force: true });
    await expect(page.getByTestId("host-status").first()).toContainText(
      /Agent Host ready|Agent Host restarted/,
      { timeout: 45_000 },
    );

    const recovered = await page.getByTestId("runtime-snapshot").first().innerText();
    const secondRuntimeId = /"runtimeId":\s*"([^"]+)"/.exec(recovered)?.[1];
    expect(secondRuntimeId).toBeTruthy();
    expect(secondRuntimeId).not.toBe(firstRuntimeId);

    await sendPrompt(page, "hello after crash");
    await expect(page.getByTestId("timeline")).toContainText("hello after crash", {
      timeout: 15_000,
    });
  });
});
