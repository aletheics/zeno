import type { Page } from "@playwright/test";
import { conversationSessionButtons, expect, sendPrompt, startHost, test } from "./fixtures.ts";

async function terminalStatus(page: Page) {
  return page.evaluate(() => window.pix.terminal.status());
}

/** Inspect real Ghostty paint health — not just "surface-ready" attribute. */
async function inspectTerminalPaint(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="pi-tui-terminal"]') as HTMLElement | null;
    const host = document.querySelector(".pi-tui-terminal-host") as HTMLElement | null;
    const canvas = host?.querySelector("canvas") as HTMLCanvasElement | null;
    const textarea = host?.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!root || !host) {
      return { ok: false as const, reason: "missing-root" };
    }
    const ready = root.getAttribute("data-surface-ready") === "true";
    const cols = Number(root.getAttribute("data-paint-cols") || 0);
    const rows = Number(root.getAttribute("data-paint-rows") || 0);
    const bytes = Number(root.getAttribute("data-paint-bytes") || 0);
    const canvasW = Number(root.getAttribute("data-paint-canvas-w") || 0);
    const canvasH = Number(root.getAttribute("data-paint-canvas-h") || 0);
    const hostStyle = getComputedStyle(host);
    const opacity = Number(hostStyle.opacity);
    const hostRect = host.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();

    let nonBlankSamples = 0;
    let sampleTried = 0;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      // Prefer 2d readback; WebGL may share the drawing buffer.
      try {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const points = [
            [4, 4],
            [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)],
            [canvas.width - 5, canvas.height - 5],
            [Math.floor(canvas.width / 3), Math.floor(canvas.height / 3)],
          ] as const;
          for (const [x, y] of points) {
            sampleTried += 1;
            const px = ctx.getImageData(x, y, 1, 1).data;
            const r = px[0] ?? 0;
            const g = px[1] ?? 0;
            const b = px[2] ?? 0;
            const a = px[3] ?? 0;
            // Any non-transparent / non-pure-black-or-white-only noise counts as paint.
            if (a > 0 && (r > 2 || g > 2 || b > 2)) nonBlankSamples += 1;
            else if (a > 0 && (r < 250 || g < 250 || b < 250)) nonBlankSamples += 1;
          }
        }
      } catch {
        // WebGL-only canvas — fall back to dimension + byte gates.
      }
      try {
        const gl =
          (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ||
          (canvas.getContext("webgl") as WebGLRenderingContext | null);
        if (gl && sampleTried === 0) {
          const buf = new Uint8Array(4);
          gl.readPixels(
            Math.floor(canvas.width / 2),
            Math.floor(canvas.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            buf,
          );
          sampleTried += 1;
          const r = buf[0] ?? 0;
          const g = buf[1] ?? 0;
          const b = buf[2] ?? 0;
          const a = buf[3] ?? 0;
          if (a > 0 && (r > 2 || g > 2 || b > 2 || r < 250)) {
            nonBlankSamples += 1;
          }
        }
      } catch {
        // ignore
      }
    }

    const gridOk = cols >= 20 && rows >= 5;
    const sizeOk =
      hostRect.width >= 80 &&
      hostRect.height >= 40 &&
      (canvasW >= 40 || (canvasRect?.width ?? 0) >= 40) &&
      (canvasH >= 40 || (canvasRect?.height ?? 0) >= 40);
    const visibleOk = ready && opacity > 0.9;
    // A uniform themed background is nonblank too, so require actual PTY output as well
    const paintOk = bytes >= 1 && (nonBlankSamples > 0 || (gridOk && sizeOk && Boolean(canvas)));

    return {
      ok: visibleOk && gridOk && sizeOk && paintOk && Boolean(canvas),
      ready,
      opacity,
      cols,
      rows,
      bytes,
      canvasW,
      canvasH,
      hostW: Math.round(hostRect.width),
      hostH: Math.round(hostRect.height),
      canvasClientW: Math.round(canvasRect?.width ?? 0),
      canvasClientH: Math.round(canvasRect?.height ?? 0),
      nonBlankSamples,
      sampleTried,
      hasCanvas: Boolean(canvas),
      hasTextarea: Boolean(textarea),
      focused: document.activeElement === textarea,
    };
  });
}

async function expectTerminalPainted(page: Page, sessionFile: string): Promise<void> {
  await expect(page.getByTestId("thread-terminal-surface")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("pi-tui-terminal")).toHaveAttribute("data-surface-ready", "true", {
    timeout: 45_000,
  });
  await expect
    .poll(() => terminalStatus(page), { timeout: 45_000 })
    .toMatchObject({ open: true, suspended: false, sessionFile });

  // Real paint: grid + canvas + bytes/pixels — not just the ready flag.
  await expect
    .poll(async () => inspectTerminalPaint(page), {
      timeout: 45_000,
      intervals: [100, 200, 400, 800],
    })
    .toMatchObject({ ok: true, ready: true, hasCanvas: true });

  const paint = await inspectTerminalPaint(page);
  expect(paint.cols, `cols too small: ${JSON.stringify(paint)}`).toBeGreaterThanOrEqual(20);
  expect(paint.rows, `rows too small: ${JSON.stringify(paint)}`).toBeGreaterThanOrEqual(5);
  expect(paint.hostW, `host width: ${JSON.stringify(paint)}`).toBeGreaterThanOrEqual(80);
  expect(paint.hostH, `host height: ${JSON.stringify(paint)}`).toBeGreaterThanOrEqual(40);
  expect(paint.opacity, `host hidden: ${JSON.stringify(paint)}`).toBeGreaterThan(0.9);
  // The poll above requires actual PTY bytes, so a themed but empty canvas cannot pass
  expect(paint.bytes, `no PTY paint bytes: ${JSON.stringify(paint)}`).toBeGreaterThanOrEqual(1);
}

async function expectChatTimeline(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId("thread-terminal-surface")).toHaveCount(0);
  await expect(page.getByTestId("composer-dock")).toBeVisible();
  await expect(page.locator(".timeline-scroll")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("timeline")).toContainText(text);
}

async function switchConversationByPath(page: Page, sessionFile: string): Promise<void> {
  const buttons = conversationSessionButtons(page);
  const index = await buttons.evaluateAll(
    (nodes, path) => nodes.findIndex((node) => (node as HTMLElement).dataset.sessionPath === path),
    sessionFile,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  await buttons.nth(index).click();
}

/** Layout contract: equal L/R content margins + floating right-edge scrollbar. */
async function inspectTerminalLayout(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="pi-tui-terminal"]') as HTMLElement | null;
    const host = document.querySelector(".pi-tui-terminal-host") as HTMLElement | null;
    const canvas = host?.querySelector("canvas") as HTMLCanvasElement | null;
    const thumb = document.querySelector(".pi-tui-scroll-thumb") as HTMLElement | null;
    const shellMain = document.querySelector('[data-testid="shell-main"]') as HTMLElement | null;
    if (!root || !host || !canvas) {
      return { ok: false as const, reason: "missing-nodes" };
    }
    const hostStyle = getComputedStyle(host);
    const thumbStyle = thumb ? getComputedStyle(thumb) : null;
    const padL = Number.parseFloat(hostStyle.paddingLeft) || 0;
    const padR = Number.parseFloat(hostStyle.paddingRight) || 0;
    const hostRect = host.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const shellRect = shellMain?.getBoundingClientRect();
    const thumbRect = thumb?.getBoundingClientRect();
    const leftGap = canvasRect.left - hostRect.left;
    const rightGap = hostRect.right - canvasRect.right;
    return {
      ok: true as const,
      padL,
      padR,
      leftGap: Math.round(leftGap * 10) / 10,
      rightGap: Math.round(rightGap * 10) / 10,
      gapDelta: Math.round(Math.abs(leftGap - rightGap) * 10) / 10,
      hostW: Math.round(hostRect.width),
      hostRight: Math.round(hostRect.right),
      shellRight: shellRect ? Math.round(shellRect.right) : null,
      canvasW: Math.round(canvasRect.width),
      canvasLeft: Math.round(canvasRect.left),
      canvasRight: Math.round(canvasRect.right),
      thumbExists: Boolean(thumb),
      thumbPosition: thumbStyle?.position ?? null,
      thumbVisible: thumb?.dataset.visible === "true",
      thumbRight: thumbRect ? Math.round(thumbRect.right) : null,
      thumbLeft: thumbRect ? Math.round(thumbRect.left) : null,
      // Floating thumb must not reserve layout width inside the host.
      thumbInHostFlow: Boolean(host.querySelector(".pi-tui-scroll-thumb")),
    };
  });
}

test.describe("Embedded pi TUI", () => {
  test("keeps equal content margins and a floating right-edge scrollbar", async ({ page }) => {
    await startHost(page);
    await sendPrompt(page, "terminal layout margins");
    const session = await page.evaluate(() => window.pix.host.snapshot());
    expect(session.sessionFile).toBeTruthy();

    await page.getByTestId("thread-content-mode-toggle").click();
    await expectTerminalPainted(page, session.sessionFile!);

    await expect
      .poll(async () => inspectTerminalLayout(page), {
        timeout: 15_000,
        intervals: [100, 200, 400],
      })
      .toMatchObject({
        ok: true,
        thumbExists: true,
        thumbPosition: "fixed",
        thumbInHostFlow: false,
      });

    const layout = await inspectTerminalLayout(page);
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;

    // Equal host padding (TERMINAL_CONTENT_INSET_PX = 8).
    expect(layout.padL, `padL: ${JSON.stringify(layout)}`).toBe(8);
    expect(layout.padR, `padR: ${JSON.stringify(layout)}`).toBe(8);
    // Canvas residual is centered: left gap ≈ right gap (allow one cell of slack).
    expect(layout.gapDelta, `asymmetric gaps: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(12);
    // Content stays inside the padded host (not full-bleed under one side only).
    expect(layout.leftGap, `leftGap: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(7);
    expect(layout.rightGap, `rightGap: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(7);
    // No Ghostty gA-style ~15px one-sided steal: both sides share residual.
    expect(Math.abs(layout.leftGap - layout.padL), JSON.stringify(layout)).toBeLessThanOrEqual(12);
    expect(Math.abs(layout.rightGap - layout.padR), JSON.stringify(layout)).toBeLessThanOrEqual(12);

    // Try to reveal scrollback chrome (wheel up). Fresh sessions may have no
    // scrollback — structural chrome is always required; flush is asserted when visible.
    const terminal = page.getByTestId("pi-tui-terminal");
    await terminal.hover();
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -160);
    }

    const afterScroll = await inspectTerminalLayout(page);
    expect(afterScroll.ok).toBe(true);
    if (!afterScroll.ok) return;
    // Margins must not shift when the overlay thumb is shown or hidden.
    expect(afterScroll.padL).toBe(8);
    expect(afterScroll.padR).toBe(8);
    expect(
      afterScroll.gapDelta,
      `margins skewed after scroll: ${JSON.stringify(afterScroll)}`,
    ).toBeLessThanOrEqual(12);
    expect(afterScroll.thumbExists).toBe(true);
    expect(afterScroll.thumbPosition).toBe("fixed");
    expect(afterScroll.thumbInHostFlow).toBe(false);

    if (afterScroll.thumbVisible && afterScroll.thumbRight != null) {
      // Thumb sits on the shell-main right edge (or the terminal pane right if they match).
      const edge = afterScroll.shellRight ?? afterScroll.hostRight;
      expect(
        Math.abs(afterScroll.thumbRight - edge),
        `thumb not flush to app right: ${JSON.stringify(afterScroll)}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  test("paints correctly across terminal/chat and multi-session hops", async ({ page }) => {
    await startHost(page);
    await sendPrompt(page, "terminal session A");
    const sessionA = await page.evaluate(() => window.pix.host.snapshot());
    expect(sessionA.sessionFile).toBeTruthy();

    // A: chat → terminal (cold open) must paint a real grid/canvas.
    await page.getByTestId("thread-content-mode-toggle").click();
    await expectTerminalPainted(page, sessionA.sessionFile!);
    await expect(page.getByTestId("surface-transition-mask")).toHaveCount(0);

    const paintA1 = await inspectTerminalPaint(page);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const value = (
              document.querySelector(".pi-tui-terminal-host textarea") as HTMLTextAreaElement | null
            )?.style.left.replace("px", "");
            return Number(value);
          }),
        { timeout: 5_000 },
      )
      .toBeLessThan(20);

    const terminalInput = page.locator(".pi-tui-terminal-host textarea");
    await expect(terminalInput).toBeFocused();
    const pinnedCaret = await terminalInput.evaluate((textarea) => ({
      left: textarea.style.left,
      top: textarea.style.top,
      width: textarea.style.width,
      height: textarea.style.height,
      caretColor: textarea.style.caretColor,
    }));
    expect(pinnedCaret.width).toBe("1px");
    expect(pinnedCaret.caretColor).toBe("transparent");

    // Type into TUI — must stay focused and keep a valid paint surface.
    await page.keyboard.type("x");
    const bytesBefore = paintA1.bytes ?? 0;
    await expect
      .poll(async () => (await inspectTerminalPaint(page)).bytes ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(bytesBefore);

    // A: terminal → chat must show timeline text (view mode render).
    await page.getByTestId("thread-content-mode-toggle").click();
    await expectChatTimeline(page, "terminal session A");
    await expect
      .poll(() => terminalStatus(page))
      .toMatchObject({
        open: false,
        suspended: true,
        sessionFile: sessionA.sessionFile,
      });

    // A: chat → terminal resume must repaint (not blank).
    await page.getByTestId("thread-content-mode-toggle").click();
    await expectTerminalPainted(page, sessionA.sessionFile!);
    const paintA2 = await inspectTerminalPaint(page);
    expect(paintA2.bytes).toBeGreaterThanOrEqual(1);
    expect(paintA2.cols).toBeGreaterThanOrEqual(20);

    // Session B defaults to chat; open terminal there.
    await startHost(page);
    await expect(page.getByTestId("composer-dock")).toBeVisible({ timeout: 30_000 });
    await sendPrompt(page, "terminal session B");
    const sessionB = await page.evaluate(() => window.pix.host.snapshot());
    expect(sessionB.sessionFile).toBeTruthy();
    expect(sessionB.sessionFile).not.toBe(sessionA.sessionFile);
    await expect(conversationSessionButtons(page)).toHaveCount(2, { timeout: 15_000 });

    await page.getByTestId("thread-content-mode-toggle").click();
    await expectTerminalPainted(page, sessionB.sessionFile!);
    await expect
      .poll(() => terminalStatus(page))
      .toMatchObject({ parkedSessionFiles: [sessionA.sessionFile], sessionCount: 2 });

    // Terminal ↔ terminal hop A: promote warm PTY + full paint.
    await switchConversationByPath(page, sessionA.sessionFile!);
    await expectTerminalPainted(page, sessionA.sessionFile!);
    await expect(page.getByTestId("surface-transition-mask")).toHaveCount(0);
    const paintA3 = await inspectTerminalPaint(page);
    expect(paintA3.bytes).toBeGreaterThanOrEqual(1);
    expect(paintA3.hostW).toBeGreaterThanOrEqual(80);
    await expect
      .poll(() => terminalStatus(page))
      .toMatchObject({ parkedSessionFiles: [sessionB.sessionFile], sessionCount: 2 });

    // Hop B again — paint still valid.
    await switchConversationByPath(page, sessionB.sessionFile!);
    await expectTerminalPainted(page, sessionB.sessionFile!);
    const paintB2 = await inspectTerminalPaint(page);
    expect(paintB2.cols).toBeGreaterThanOrEqual(20);
    expect(paintB2.rows).toBeGreaterThanOrEqual(5);

    // Mixed: B → chat, A stays terminal preference and must paint when selected.
    await page.getByTestId("thread-content-mode-toggle").click();
    await expectChatTimeline(page, "terminal session B");
    await switchConversationByPath(page, sessionA.sessionFile!);
    await expectTerminalPainted(page, sessionA.sessionFile!);
    await switchConversationByPath(page, sessionB.sessionFile!);
    await expectChatTimeline(page, "terminal session B");

    // Chat prompt on B drops B's parked PTY; A remains warm terminal.
    await sendPrompt(page, "chat owns session B");
    await expect
      .poll(() => terminalStatus(page))
      .toMatchObject({
        open: false,
        suspended: true,
        sessionFile: sessionA.sessionFile,
        parkedSessionFiles: [],
        sessionCount: 1,
      });

    // Final: back to A terminal — must still paint after chat activity on B.
    await switchConversationByPath(page, sessionA.sessionFile!);
    await expectTerminalPainted(page, sessionA.sessionFile!);
    const paintFinal = await inspectTerminalPaint(page);
    expect(paintFinal.ok).toBe(true);
    expect(paintFinal.bytes).toBeGreaterThanOrEqual(1);
    expect(paintFinal.hasCanvas).toBe(true);
  });
});
