export type ContentMediaKind = "image" | "video";

export type ContentLinkTarget =
  | { kind: "anchor"; href: string }
  | { kind: "external"; href: string }
  | { kind: "file"; path: string; line?: number; column?: number }
  | { kind: "blocked" };

const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"]);

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pathExtension(value: string): string {
  const clean = value.split(/[?#]/, 1)[0] ?? "";
  return clean.match(/\.([^./\\]+)$/)?.[1]?.toLocaleLowerCase() ?? "";
}

export function contentMediaKind(source: string): ContentMediaKind {
  return VIDEO_EXTENSIONS.has(pathExtension(source)) ? "video" : "image";
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function resolveRelativePath(base: string, value: string): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  const normalizedBase = base.replace(/\\/g, "/").replace(/\/+$/, "");
  const stack = normalizedBase.split("/");
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join(separator);
}

function parseFileLocation(value: string): { path: string; line?: number; column?: number } {
  const hashMatch = /^(.*?)#L(\d+)(?:C(\d+))?$/.exec(value);
  const suffixMatch = /^(.*?):(\d+)(?::(\d+))?$/.exec(value);
  const match = hashMatch ?? suffixMatch;
  if (!match) return { path: value };
  const result: { path: string; line?: number; column?: number } = {
    path: match[1] ?? value,
    line: Number(match[2]),
  };
  if (match[3]) result.column = Number(match[3]);
  return result;
}

export function parseContentLink(href: string, workspacePath?: string): ContentLinkTarget {
  const value = href.trim();
  if (!value) return { kind: "blocked" };
  if (value.startsWith("#")) return { kind: "anchor", href: value };
  if (/^(https?:|mailto:)/i.test(value)) return { kind: "external", href: value };
  if (/^(javascript:|data:|vbscript:)/i.test(value)) return { kind: "blocked" };

  let decoded = safeDecode(value);
  if (/^file:/i.test(decoded)) {
    try {
      const fileUrl = new URL(decoded);
      decoded = safeDecode(fileUrl.pathname);
      if (/^\/[a-zA-Z]:\//.test(decoded)) decoded = decoded.slice(1);
      if (fileUrl.hash) decoded += fileUrl.hash;
    } catch {
      return { kind: "blocked" };
    }
  }

  const location = parseFileLocation(decoded);
  if (!isAbsolutePath(location.path)) {
    if (!workspacePath) return { kind: "blocked" };
    location.path = resolveRelativePath(workspacePath, location.path);
  }
  return { kind: "file", ...location };
}

function encodeFilePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => (/^[a-zA-Z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join("/");
}

function pathBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Display path for session UI (tool rows, source citations).
 * Prefer workspace-relative (`src/app.ts`); fall back to basename when outside workspace.
 * Matches how product chat shortens absolute tool paths under the open project.
 */
export function formatWorkspaceRelativePath(path: string, workspacePath?: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return path;
  const base = workspacePath?.replace(/\\/g, "/").replace(/\/+$/, "");
  if (base) {
    if (normalized === base) return pathBasename(normalized);
    if (normalized.startsWith(`${base}/`)) {
      const relative = normalized.slice(base.length + 1);
      if (relative) return relative;
    }
  }
  // Already relative (no leading / or drive) — keep as authored.
  if (!isAbsolutePath(normalized)) return normalized;
  return pathBasename(normalized);
}

/**
 * Label for a markdown file citation: keep author text when it's a real name,
 * but collapse absolute/full paths to the workspace-relative form.
 */
export function formatFileLinkLabel(
  childrenText: string,
  absolutePath: string,
  workspacePath?: string,
): string {
  const display = formatWorkspaceRelativePath(absolutePath, workspacePath);
  const raw = childrenText.replace(/\s+/g, " ").trim();
  if (!raw) return display;
  const base = pathBasename(absolutePath);
  const normChild = raw.replace(/\\/g, "/");
  const normAbs = absolutePath.replace(/\\/g, "/");
  // Author used the full path or basename as the link text → show relative form.
  if (
    normChild === normAbs ||
    normChild === display ||
    normChild === base ||
    normChild.endsWith(`/${base}`) ||
    normChild.endsWith(`\\${base}`)
  ) {
    return display;
  }
  return raw;
}

export function contentSourceUrl(source: string, workspacePath?: string): string {
  const value = source.trim();
  if (/^(https?:|data:|blob:|file:)/i.test(value)) return value;
  const decoded = safeDecode(value);
  const path = isAbsolutePath(decoded)
    ? decoded
    : workspacePath
      ? resolveRelativePath(workspacePath, decoded)
      : decoded;
  if (!isAbsolutePath(path)) return source;
  const encoded = encodeFilePath(path);
  if (encoded.startsWith("//")) return `file:${encoded}`;
  return `file://${encoded.startsWith("/") ? "" : "/"}${encoded}`;
}
