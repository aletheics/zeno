/**
 * View-mode session content demo — same components and wiring as product chat.
 *
 * TimelineItem[] → SessionTimelineScroller (the exact component used by main.tsx).
 * QueuedMessages → ComposerQueueCard (same strip as product Composer).
 *
 * No decorative phase galleries; no force-open of completed process blocks.
 */
import { useEffect, useMemo, useState } from "react";
import type { QueuedMessages } from "@zeno/contracts";
import { ComposerQueueCard } from "./components/ComposerQueueCard.tsx";
import { SessionTimelineScroller } from "./components/SessionTimelineContent.tsx";
import { applyDocumentTheme } from "./lib/theme.ts";
import {
  allDemoScenarios,
  DEMO_WORKSPACE,
  type DemoScenario,
} from "./session-content-demo-fixtures.ts";
import "./styles.css";

applyDocumentTheme("dark");

const EMPTY_QUEUE: QueuedMessages = { steering: [], followUp: [] };

function useDemoDocumentScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    html.style.setProperty("height", "auto", "important");
    html.style.setProperty("overflow", "auto", "important");
    body.style.setProperty("height", "auto", "important");
    body.style.setProperty("min-height", "100%", "important");
    body.style.setProperty("overflow", "auto", "important");
    body.style.setProperty("overflow-y", "auto", "important");
    body.style.setProperty("overflow-x", "hidden", "important");
    if (root) {
      root.style.setProperty("height", "auto", "important");
      root.style.setProperty("min-height", "100%", "important");
      root.style.setProperty("overflow", "visible", "important");
    }
  }, []);
}

function ScenarioTimeline(props: { scenario: DemoScenario; locale: "zh" | "en" }) {
  const { scenario, locale } = props;
  const running = Boolean(scenario.running);
  const waiting = Boolean(scenario.waiting);
  const events = scenario.events ?? [];
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessages>(
    () => scenario.queuedMessages ?? EMPTY_QUEUE,
  );
  const [paused, setPaused] = useState(() => Boolean(scenario.queuePaused));

  useEffect(() => {
    setQueuedMessages(scenario.queuedMessages ?? EMPTY_QUEUE);
    setPaused(Boolean(scenario.queuePaused));
  }, [scenario.id, scenario.queuedMessages, scenario.queuePaused]);

  const queueCount = queuedMessages.steering.length + queuedMessages.followUp.length;
  const showQueueDock = Boolean(scenario.queuedMessages);

  return (
    <div
      className="thread-pane h-auto overflow-hidden rounded-lg border border-border/60 bg-background"
      data-testid={`timeline-${scenario.id}`}
      data-demo="session-content"
      data-demo-scenario={scenario.id}
      data-has-queue={queueCount > 0 ? "true" : "false"}
      data-queue-paused={paused ? "true" : "false"}
    >
      <SessionTimelineScroller
        autoScroll={scenario.items.length > 0}
        viewportSizing="content"
        viewportBusy={false}
        viewportReady
        items={scenario.items}
        events={events}
        running={running}
        waiting={waiting}
        locale={locale}
        sessionKey={scenario.id}
        workspacePath={DEMO_WORKSPACE}
        onEditUser={() => undefined}
        onForkAssistant={() => undefined}
        testId={`timeline-content-${scenario.id}`}
      />
      {/*
        Product docks Composer under the timeline; the queue strip sits above the
        prompt. Demo mounts the same ComposerQueueCard without the full composer
        chrome (no Electron host for model/git menus).
      */}
      {showQueueDock ? (
        <div
          className="composer-dock pointer-events-auto w-full shrink-0 border-t border-border/40 bg-[var(--canvas)] px-3 pt-2 pb-3"
          data-testid={`composer-dock-${scenario.id}`}
        >
          <ComposerQueueCard
            locale={locale}
            queuedMessages={queuedMessages}
            paused={paused && queueCount > 0}
            onClearQueue={() => {
              setQueuedMessages(EMPTY_QUEUE);
              setPaused(false);
            }}
          />
          {queueCount === 0 ? (
            <p
              className="px-1 pt-1 text-[11px] text-muted-foreground"
              data-testid={`queue-cleared-${scenario.id}`}
            >
              队列已清空（demo 本地状态；产品会调用 agent.clearQueue）
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SessionContentDemoApp() {
  useDemoDocumentScroll();
  const locale = "zh" as const;
  const scenarios = useMemo(() => allDemoScenarios(), []);

  return (
    <div
      className="min-h-full bg-background text-foreground"
      style={{ overflow: "visible" }}
      data-testid="session-content-demo"
      data-theme="dark"
    >
      <div className="mx-auto max-w-[840px] space-y-10 px-4 py-6 pb-16">
        <header className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight">视图模式 · 会话内容渲染</h1>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            与应用直接共用 SessionTimelineScroller 和相同的数据形态。快照与 e2e 的 fake 模型 rich
            content、pi 工具 payload 对齐；不维护第二套近似渲染。
          </p>
          <p className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            启动：
            <code className="text-foreground">pnpm demo:session-content</code>
            （仓库根）或{" "}
            <code className="text-foreground">pnpm --filter @zeno/desktop demo:session-content</code>
            <br />
            地址：
            <code className="text-foreground">http://127.0.0.1:4177/session-content-demo.html</code>
            · 改代码后需重新执行命令重建 · 勿用 file:// 打开
          </p>
        </header>

        {scenarios.map((scenario) => (
          <section key={scenario.id} className="space-y-3" data-scenario={scenario.id}>
            <div className="space-y-1 px-0.5">
              <h2 className="text-sm font-medium text-foreground">{scenario.title}</h2>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {scenario.description}
              </p>
            </div>
            <ScenarioTimeline scenario={scenario} locale={locale} />
          </section>
        ))}
      </div>
    </div>
  );
}
