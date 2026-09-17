/**
 * The anti-God-module ratchet.
 *
 * Two files here reached 6,000 and 5,500 lines by absorbing everything that never got its
 * own module. Nothing stopped that: the contributing guide asks for small, focused modules,
 * but no check enforced it, so the growth was invisible until the files were unpleasant to
 * work in — by which point every change meant reading a 6,000-line file to find the four
 * places that needed editing.
 *
 * This makes the ceiling explicit and machine-checked. The budgets are the sizes at the
 * time of writing, so they can only shrink: adding to one of these files means extracting
 * something else first. That is the whole point — a budget you can raise is not a budget.
 *
 * Run: node apps/desktop/scripts/file-budget.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

/**
 * Frozen ceilings, measured 2026-09-17. Lower them as files shrink; do not raise them.
 * Each entry is a file that is too big already — the ratchet stops it getting worse while
 * the extraction is done incrementally.
 */
const FROZEN = {
  "main/index.ts": 5985,
  "renderer/main.tsx": 4615,
  "renderer/components/settings/SettingsPage.tsx": 5547,
  "renderer/lib/i18n.ts": 2828,
  "renderer/components/Composer.tsx": 2194,
};

/** No other source file may reach this. Catches a new God module while it is still small. */
const NEW_FILE_CEILING = 2000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Source files under `src/`, excluding tests — tests are allowed to be long. */
function sourceFiles(directory = SRC) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const lineCount = (file) => readFileSync(file, "utf8").split("\n").length - 1;

function checkBudgets() {
  const frozen = new Map(Object.entries(FROZEN));
  const grown = [];
  const tighten = [];

  for (const file of sourceFiles()) {
    const key = relative(SRC, file).split("\\").join("/");
    const lines = lineCount(file);
    const budget = frozen.get(key);

    if (budget !== undefined) {
      if (lines > budget)
        grown.push(`  ${key}: ${lines} lines, budget ${budget} (+${lines - budget})`);
      else if (lines < budget) tighten.push(`  ${key}: ${lines} lines, budget ${budget}`);
      continue;
    }

    if (lines >= NEW_FILE_CEILING) {
      grown.push(`  ${key}: ${lines} lines, ceiling ${NEW_FILE_CEILING} (new God module)`);
    }
  }

  for (const key of frozen.keys()) {
    assert(
      sourceFiles().some((f) => relative(SRC, f).split("\\").join("/") === key),
      `Budgeted file ${key} no longer exists. Remove its budget if it was renamed or split.`,
    );
  }

  assert(
    grown.length === 0,
    [
      "A budgeted file grew.",
      "",
      ...grown,
      "",
      "Do not raise the budget. Extract a module from the file instead — the ratchet only",
      "works because the number is not negotiable. Budgets live in this file and are meant",
      "to be lowered as files shrink.",
    ].join("\n"),
  );

  return { tighten };
}

const { tighten } = checkBudgets();

// Not failures: shrinking is the goal. Reported so the ceiling can be pulled down to match.
if (tighten.length > 0) {
  console.log(`${tighten.length} budget(s) can be tightened:`);
  console.log(tighten.join("\n"));
}

console.log(
  `file budgets ok (${Object.keys(FROZEN).length} frozen, ${NEW_FILE_CEILING}-line ceiling for the rest)`,
);
