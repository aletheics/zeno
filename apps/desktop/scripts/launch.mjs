/**
 * Desktop launcher (no watch). Used by `pnpm dev` after build.
 *
 * - Interactive: real HOME and last durable workspace.
 * - Isolated (`PIX_ISOLATED=1`): temp HOME, fixture workspace, fake model.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { prepareLaunchEnv } from "./launch-env.mjs";

const require = createRequire(import.meta.url);
const electron = require("electron");
const appDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

const isolated = process.env.PIX_ISOLATED === "1";
const prepared = await prepareLaunchEnv({ isolated });

console.log(prepared.label);
let exitCode = 1;
try {
  const child = spawn(electron, [appDirectory], {
    cwd: appDirectory,
    env: prepared.environment,
    stdio: "inherit",
  });
  exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Electron exited from signal ${signal}`));
      else resolve(code ?? 1);
    });
  });
} finally {
  await prepared.cleanup();
}

process.exitCode = exitCode;
