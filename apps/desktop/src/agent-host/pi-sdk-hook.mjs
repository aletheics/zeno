/**
 * Node ESM resolve hook: when PIX_PI_SDK_SOURCE=global and PIX_PI_SDK_ROOT is set,
 * remap @earendil-works/pi-coding-agent imports to that package root.
 *
 * Registered from agent-host bootstrap before loading the main host module.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE = "@earendil-works/pi-coding-agent";

function packageRoot() {
  const root = process.env.PIX_PI_SDK_ROOT?.trim();
  if (!root) return undefined;
  if (process.env.PIX_PI_SDK_SOURCE?.trim() !== "global") return undefined;
  if (!existsSync(join(root, "package.json"))) return undefined;
  return root;
}

function resolveUnderRoot(root, subpath) {
  // subpath "" → package entry (exports ".")
  if (!subpath || subpath === "." || subpath === "./") {
    const candidates = [
      join(root, "dist", "index.js"),
      join(root, "index.js"),
      join(root, "dist", "cli.js"),
    ];
    for (const file of candidates) {
      if (existsSync(file)) return pathToFileURL(file).href;
    }
    return pathToFileURL(join(root, "dist", "index.js")).href;
  }
  const rel = subpath.startsWith("./") ? subpath.slice(2) : subpath;
  const file = join(root, rel);
  if (existsSync(file)) return pathToFileURL(file).href;
  if (existsSync(`${file}.js`)) return pathToFileURL(`${file}.js`).href;
  if (existsSync(join(file, "index.js"))) return pathToFileURL(join(file, "index.js")).href;
  return pathToFileURL(file).href;
}

export async function resolve(specifier, context, nextResolve) {
  const root = packageRoot();
  if (!root) return nextResolve(specifier, context);

  if (specifier === PACKAGE) {
    return {
      shortCircuit: true,
      url: resolveUnderRoot(root, "."),
    };
  }
  if (specifier.startsWith(`${PACKAGE}/`)) {
    const sub = specifier.slice(PACKAGE.length + 1);
    return {
      shortCircuit: true,
      url: resolveUnderRoot(root, sub),
    };
  }
  return nextResolve(specifier, context);
}

// Keep dirname import used for potential future relative resolution diagnostics.
void dirname;
