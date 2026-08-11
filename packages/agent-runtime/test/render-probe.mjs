import { createPixRuntime, projectCustomEntry, projectCustomMessage } from "../src/index.ts";

const [project, agentDir] = process.argv.slice(2);
if (!project || !agentDir) throw new Error("render-probe requires project and agentDir");

const handle = await createPixRuntime({ cwd: project, agentDir });

try {
  await handle.runtime.session.prompt("/probe-emit");

  const messages = handle.runtime.session.messages;
  const customMessages = messages.filter((message) => message.role === "custom");
  const visibleSource = customMessages.find((message) => message.customType === "pix-u05");
  const hiddenSource = customMessages.find((message) => message.customType === "pix-ext-hidden");

  const entries = handle.runtime.session.sessionManager
    .getEntries()
    .filter((entry) => entry.type === "custom");
  const entrySource = entries.find((entry) => entry.customType === "pix-ext-entry");

  const visible = visibleSource ? projectCustomMessage(visibleSource) : null;
  const hidden = hiddenSource ? projectCustomMessage(hiddenSource) : null;
  const entry = entrySource ? projectCustomEntry(entrySource) : null;

  // Prefer live counters from the extension module when present.
  const rendererCounts = globalThis.__pixU05Counts ?? {
    messageRendererCalls: 0,
    entryRendererCalls: 0,
  };

  // Host-side projection must not touch registered factories either.
  if (handle.runtime.session.extensionRunner) {
    const messageRenderer = handle.runtime.session.extensionRunner.getMessageRenderer("pix-u05");
    const entryRenderer = handle.runtime.session.extensionRunner.getEntryRenderer("pix-ext-entry");
    if (messageRenderer) {
      // Existence of factory is fine; we must not call it for desktop projection.
    }
    if (entryRenderer) {
      // same
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      visible,
      hidden,
      entry,
      rendererCounts,
      snapshot: handle.snapshot(),
    })}\n`,
  );
} finally {
  await handle.dispose();
}
