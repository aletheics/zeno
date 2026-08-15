import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import {
  NATIVE_ASAR_UNPACK_GLOBS,
  asarPackageJsonEntry,
  extractSelectedAsarFiles,
  packageNameFromAsarEntry,
  productionDependencyClosure,
  selectAsarFilesForPackages,
  selectPiTuiAsarFiles,
} from "./asar-unpack.ts";

describe("asar-unpack", () => {
  it("parses package names from asar paths", () => {
    expect(packageNameFromAsarEntry("/node_modules/chalk/index.js")).toBe("chalk");
    expect(
      packageNameFromAsarEntry("node_modules/@earendil-works/pi-coding-agent/dist/cli.js"),
    ).toBe("@earendil-works/pi-coding-agent");
    expect(packageNameFromAsarEntry("node_modules/foo/node_modules/bar/index.js")).toBe("bar");
    expect(packageNameFromAsarEntry("node_modules/.bin/pi")).toBeUndefined();
  });

  it("keeps selected packages and the pi bin", () => {
    const files = [
      "node_modules/@earendil-works/pi-coding-agent/package.json",
      "node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      "node_modules/chalk/package.json",
      "node_modules/chalk/index.js",
      "node_modules/react/index.js",
      "node_modules/.bin/pi",
    ];
    const selected = selectAsarFilesForPackages(
      files,
      new Set(["@earendil-works/pi-coding-agent", "chalk"]),
    );
    expect(selected).toContain("node_modules/chalk/index.js");
    expect(selected).toContain("node_modules/.bin/pi");
    expect(selected).not.toContain("node_modules/react/index.js");
  });

  it("prefers the flattened package.json", () => {
    const files = [
      "node_modules/@earendil-works/pi-coding-agent/package.json",
      "node_modules/foo/node_modules/@earendil-works/pi-coding-agent/package.json",
    ];
    expect(asarPackageJsonEntry(files, "@earendil-works/pi-coding-agent")).toBe(
      "node_modules/@earendil-works/pi-coding-agent/package.json",
    );
  });

  it("walks production deps and skips missing optionals", () => {
    const pkgs: Record<string, { dependencies?: Record<string, string> }> = {
      "@earendil-works/pi-coding-agent": {
        dependencies: { chalk: "1.0.0", optional: "1.0.0" },
      },
      chalk: { dependencies: {} },
    };
    const closure = productionDependencyClosure(
      ["@earendil-works/pi-coding-agent"],
      (name) => pkgs[name],
    );
    expect(closure.has("@earendil-works/pi-coding-agent")).toBe(true);
    expect(closure.has("chalk")).toBe(true);
    expect(closure.has("optional")).toBe(false);
  });

  it("selects the pi TUI tree without unrelated packages", () => {
    const files = [
      "node_modules/@earendil-works/pi-coding-agent/package.json",
      "node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      "node_modules/chalk/package.json",
      "node_modules/chalk/source/index.js",
      "node_modules/electron/index.js",
    ];
    const json: Record<string, string> = {
      "node_modules/@earendil-works/pi-coding-agent/package.json": JSON.stringify({
        dependencies: { chalk: "5.0.0" },
      }),
      "node_modules/chalk/package.json": JSON.stringify({ dependencies: {} }),
    };
    const selected = selectPiTuiAsarFiles(files, (entry) => json[entry] ?? "");
    expect(selected).toContain("node_modules/chalk/source/index.js");
    expect(selected).not.toContain("node_modules/electron/index.js");
  });

  it("writes selected asar files to dest", () => {
    const written: Array<[string, string]> = [];
    const count = extractSelectedAsarFiles({
      destRoot: "/tmp/zeno-asar-out",
      files: ["node_modules/chalk/index.js"],
      extractFile: () => Buffer.from("ok"),
      mkdir: () => undefined,
      writeFile: (path, data) => written.push([path, String(data)]),
    });
    expect(count).toBe(1);
    expect(written[0]?.[0].replace(/\\/g, "/").endsWith("node_modules/chalk/index.js")).toBe(true);
    expect(written[0]?.[1]).toBe("ok");
  });

  it("keeps electron-builder asarUnpack native-only", () => {
    const yml = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../electron-builder.yml"),
      "utf8",
    );
    expect(yml.includes('"**/node_modules/**"') || yml.includes('- "**/node_modules/**"')).toBe(
      false,
    );
    expect(yml.includes("- '**/node_modules/**'")).toBe(false);
    for (const glob of NATIVE_ASAR_UNPACK_GLOBS) {
      expect(yml).toContain(glob);
    }
  });
});
