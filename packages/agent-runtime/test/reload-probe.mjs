import { createPixRuntime } from "../src/index.ts";

const [project, agentDir] = process.argv.slice(2);
if (!project || !agentDir) throw new Error("reload-probe requires project and agentDir");

const requests = [];
const handle = await createPixRuntime({
  cwd: project,
  agentDir,
  onExtensionUiRequest: (request) => requests.push(structuredClone(request)),
});

try {
  // session_start runs during bindExtensions and should open a pending select.
  await new Promise((resolve) => setTimeout(resolve, 20));

  const pendingSelect = requests.find((request) => request.method === "select");
  if (!pendingSelect) throw new Error("Expected pending select from extension session_start");

  const beforeReload = requests.length;
  await handle.reload();

  const clearMethods = [...new Set(requests.slice(beforeReload).map((request) => request.method))];

  const lateRejected = !handle.respondExtensionUi({
    runtimeId: handle.runtimeId,
    requestId: pendingSelect.requestId,
    ok: true,
    value: "alpha",
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const afterReloadStatus = requests.some(
    (request) =>
      request.method === "setStatus" &&
      request.args &&
      typeof request.args === "object" &&
      "key" in request.args &&
      request.args.key === "after-reload",
  );

  process.stdout.write(
    `${JSON.stringify({
      pendingResolved: true,
      lateRejected,
      clearMethods,
      afterReloadStatus,
      snapshot: handle.snapshot(),
    })}\n`,
  );
} finally {
  await handle.dispose();
}
