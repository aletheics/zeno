import { useEffect, useId, useMemo, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { t, type Locale } from "../lib/i18n.ts";
import { parseDiffDisplayLines } from "../lib/process-activity.ts";
import { cn } from "../lib/utils.ts";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: "javascript",
  console: "bash",
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  shell: "bash",
  sh: "bash",
  text: "plaintext",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
};

function normalizedLanguage(language: string | undefined): string {
  const value = language?.trim().toLocaleLowerCase() || "plaintext";
  return LANGUAGE_ALIASES[value] ?? value;
}

function MermaidDiagram(props: { source: string; locale: Locale }) {
  const reactId = useId();
  const diagramId = useMemo(
    () => `zeno-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const [state, setState] = useState<{ svg?: string; error?: string }>({});

  useEffect(() => {
    let cancelled = false;
    setState({});
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: document.documentElement.dataset.theme === "light" ? "default" : "dark",
          fontFamily: "inherit",
        });
        const result = await mermaid.render(diagramId, props.source);
        if (!cancelled) setState({ svg: result.svg });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ error: error instanceof Error ? error.message : "Unable to render diagram" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [diagramId, props.source]);

  if (state.error) {
    return (
      <div className="content-mermaid-error" role="alert">
        <TriangleAlert className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">{state.error}</span>
      </div>
    );
  }
  if (!state.svg) {
    return (
      <div className="content-mermaid-loading">{t(props.locale, "timeline.diagramRendering")}</div>
    );
  }
  return (
    <div
      className="content-mermaid-diagram"
      data-testid="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}

function DiffContent(props: { code: string }) {
  const rows = useMemo(() => parseDiffDisplayLines(props.code), [props.code]);
  const lnDigits = useMemo(() => {
    let max = 1;
    for (const row of rows) {
      if (row.lineNo !== undefined) max = Math.max(max, row.lineNo);
    }
    return String(max).length;
  }, [rows]);

  return (
    <code className="content-diff-lines" style={{ ["--diff-ln-ch" as string]: String(lnDigits) }}>
      {rows.map((row, index) => (
        <span
          key={`${index}:${row.lineNo ?? ""}:${row.text}`}
          className="content-diff-line"
          data-diff={row.kind === "meta" ? undefined : row.kind}
        >
          <span className="content-diff-ln" aria-hidden="true">
            {row.lineNo !== undefined ? row.lineNo : ""}
          </span>
          <span className="content-diff-text">{row.text || " "}</span>
        </span>
      ))}
    </code>
  );
}

export function ContentCodeBlock(props: {
  code: string;
  language?: string | undefined;
  locale?: Locale | undefined;
}) {
  const language = normalizedLanguage(props.language);
  const locale = props.locale ?? "en";
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(() => {
    if (language === "diff" || language === "mermaid" || !hljs.getLanguage(language)) return "";
    return hljs.highlight(props.code, { language, ignoreIllegals: true }).value;
  }, [language, props.code]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="content-code-block" data-language={language}>
      <div className="content-code-header">
        <span className="content-code-language font-mono text-[11px] font-normal">
          {language === "plaintext" ? "text" : language}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => void copyCode()}
          aria-label={t(locale, copied ? "timeline.codeCopied" : "timeline.codeCopy")}
          title={t(locale, copied ? "timeline.codeCopied" : "timeline.codeCopy")}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      {language === "mermaid" ? (
        <MermaidDiagram source={props.code} locale={locale} />
      ) : (
        <pre className={cn("content-code-pre", language === "diff" && "content-code-diff")}>
          {language === "diff" ? (
            <DiffContent code={props.code} />
          ) : highlighted ? (
            <code
              className={`hljs language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <code>{props.code}</code>
          )}
        </pre>
      )}
    </div>
  );
}
