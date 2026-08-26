import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  ensureExtractedPiCli,
  extractedPiCliPackageRoot,
  isExtractedPiCliCurrentFor,
  isPiCliExtractCurrent,
  piCliExtractDir,
  readPiCliExtractStamp,
} from "./pi-cli-extract.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeAsarFixture(root: string): void {
  const pi = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
  mkdirSync(join(pi, "dist"), { recursive: true });
  writeFileSync(
    join(pi, "package.json"),
    JSON.stringify({
      name: "@earendil-works/pi-coding-agent",
      version: "0.84.1",
      dependencies: { chalk: "5.0.0" },
    }),
  );
  writeFileSync(join(pi, "dist", "cli.js"), "#!/usr/bin/env node\n");
  const chalk = join(root, "node_modules", "chalk");
  mkdirSync(chalk, { recursive: true });
  writeFileSync(join(chalk, "package.json"), JSON.stringify({ name: "chalk", dependencies: {} }));
  writeFileSync(join(chalk, "index.js"), "export {}\n");
  const extra = join(root, "node_modules", "react");
  mkdirSync(extra, { recursive: true });
  writeFileSync(join(extra, "index.js"), "nope\n");
}

describe("ensureExtractedPiCli", () => {
  it("copies the pi CLI production tree and skips unrelated packages", () => {
    const asar = mkdtempSync(join(tmpdir(), "zeno-asar-"));
    const userData = mkdtempSync(join(tmpdir(), "zeno-ud-"));
    tempDirs.push(asar, userData);
    writeAsarFixture(asar);

    const first = ensureExtractedPiCli({ userDataPath: userData, asarPath: asar });
    expect(first?.extractedNow).toBe(true);
    expect(first?.version).toBe("0.84.1");
    const pkg = extractedPiCliPackageRoot(userData);
    expect(pkg).toBeTruthy();
    expect(readFileSync(join(pkg!, "dist", "cli.js"), "utf8")).toContain("node");
    expect(
      readFileSync(join(piCliExtractDir(userData), "node_modules", "chalk", "index.js"), "utf8"),
    ).toContain("export");
    expect(() =>
      readFileSync(join(piCliExtractDir(userData), "node_modules", "react", "index.js")),
    ).toThrow();

    const stamp = readPiCliExtractStamp(piCliExtractDir(userData));
    expect(isPiCliExtractCurrent(stamp, "0.84.1", piCliExtractDir(userData))).toBe(true);

    const second = ensureExtractedPiCli({ userDataPath: userData, asarPath: asar });
    expect(second?.extractedNow).toBe(false);
  });

  it("re-extracts when the packaged version changes", () => {
    const asar = mkdtempSync(join(tmpdir(), "zeno-asar-"));
    const userData = mkdtempSync(join(tmpdir(), "zeno-ud-"));
    tempDirs.push(asar, userData);
    writeAsarFixture(asar);
    ensureExtractedPiCli({ userDataPath: userData, asarPath: asar });

    writeFileSync(
      join(asar, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"),
      JSON.stringify({
        name: "@earendil-works/pi-coding-agent",
        version: "0.85.0",
        dependencies: { chalk: "5.0.0" },
      }),
    );
    const again = ensureExtractedPiCli({ userDataPath: userData, asarPath: asar });
    expect(again?.extractedNow).toBe(true);
    expect(again?.version).toBe("0.85.0");
  });

  it("returns undefined when asar has no node_modules", () => {
    const empty = mkdtempSync(join(tmpdir(), "zeno-empty-"));
    const userData = mkdtempSync(join(tmpdir(), "zeno-ud-"));
    tempDirs.push(empty, userData);
    expect(ensureExtractedPiCli({ userDataPath: userData, asarPath: empty })).toBeUndefined();
  });
});

/*
 * The extract sorts ahead of node_modules in the builtin SDK search roots, so
 * anything that offers it as a root must first prove it matches the shipped
 * package — otherwise a leftover extract pins the app to the previous SDK.
 */
describe("isExtractedPiCliCurrentFor", () => {
  it("accepts an extract of the shipped version", () => {
    const asar = mkdtempSync(join(tmpdir(), "zeno-asar-"));
    const userData = mkdtempSync(join(tmpdir(), "zeno-ud-"));
    tempDirs.push(asar, userData);
    writeAsarFixture(asar);
    ensureExtractedPiCli({ userDataPath: userData, asarPath: asar });

    expect(isExtractedPiCliCurrentFor({ userDataPath: userData, asarPath: asar })).toBe(true);
  });

  it("rejects an extract left behind by an earlier release", () => {
    const asar = mkdtempSync(join(tmpdir(), "zeno-asar-"));
    const userData = mkdtempSync(join(tmpdir(), "zeno-ud-"));
    tempDirs.push(asar, userData);
    writeAsarFixture(asar);
    ensureExtractedPiCli({ userDataPath: userData, asarPath: asar });

    // Ship a newer pi without re-extracting, as an in-place upgrade does.
    writeFileSync(
      join(asar, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"),
      JSON.stringify({
        name: "@earendil-works/pi-coding-agent",
        version: "0.85.0",
        dependencies: { chalk: "5.0.0" },
      }),
    );

    expect(isExtractedPiCliCurrentFor({ userDataPath: userData, asarPath: asar })).toBe(false);
  });

  it("rejects when nothing has been extracted yet", () => {
    const asar = mkdtempSync(join(tmpdir(), "zeno-asar-"));
    const userData = mkdtempSync(join(tmpdir(), "zeno-ud-"));
    tempDirs.push(asar, userData);
    writeAsarFixture(asar);

    expect(isExtractedPiCliCurrentFor({ userDataPath: userData, asarPath: asar })).toBe(false);
  });

  it("rejects without an asar to compare against (dev runs)", () => {
    const asar = mkdtempSync(join(tmpdir(), "zeno-asar-"));
    const userData = mkdtempSync(join(tmpdir(), "zeno-ud-"));
    tempDirs.push(asar, userData);
    writeAsarFixture(asar);
    ensureExtractedPiCli({ userDataPath: userData, asarPath: asar });

    expect(isExtractedPiCliCurrentFor({ userDataPath: userData, asarPath: "  " })).toBe(false);
  });
});
