import type { HostEvent, RuntimeEvent } from "@zeno/contracts";
import { IPC_PROTOCOL_VERSION } from "@zeno/contracts";
import { describe, expect, it } from "vite-plus/test";
import { appendHostEvent, HOST_EVENT_RETENTION } from "./host-events.ts";
import { projectEventsToTimeline } from "./timeline.ts";

function runtimeEvent(sequence: number, event: RuntimeEvent, runtimeId = "rt-1"): HostEvent {
  return {
    protocolVersion: IPC_PROTOCOL_VERSION,
    type: "runtime.event",
    runtimeId,
    sequence,
    event,
  };
}

describe("appendHostEvent", () => {
  it("coalesces consecutive message.delta so early tokens are not dropped", () => {
    let events: HostEvent[] = [];
    // Far more than the old slice(-80) window.
    for (let i = 0; i < 500; i++) {
      events = appendHostEvent(
        events,
        runtimeEvent(i + 1, { type: "message.delta", delta: `w${i} ` }),
      );
    }

    // One coalesced stream event, not 500 ring slots.
    const deltas = events.filter(
      (e) => e.type === "runtime.event" && e.event.type === "message.delta",
    );
    expect(deltas).toHaveLength(1);
    if (deltas[0]?.type === "runtime.event" && deltas[0].event.type === "message.delta") {
      expect(deltas[0].event.delta.startsWith("w0 ")).toBe(true);
      expect(deltas[0].event.delta).toContain("w499 ");
      expect(deltas[0].event.delta.split(/\s+/).filter(Boolean)).toHaveLength(500);
    }

    const timeline = projectEventsToTimeline(events, []);
    const assistant = timeline.find((item) => item.kind === "assistant");
    expect(assistant?.kind === "assistant" && assistant.text.startsWith("w0 ")).toBe(true);
    expect(assistant?.kind === "assistant" && assistant.text.includes("w499 ")).toBe(true);
  });

  it("does not merge deltas across thinking / tool boundaries", () => {
    let events: HostEvent[] = [];
    events = appendHostEvent(events, runtimeEvent(1, { type: "thinking.delta", delta: "plan" }));
    events = appendHostEvent(events, runtimeEvent(2, { type: "message.delta", delta: "Hello" }));
    events = appendHostEvent(events, runtimeEvent(3, { type: "message.delta", delta: " world" }));
    events = appendHostEvent(
      events,
      runtimeEvent(4, {
        type: "tool.started",
        toolCallId: "t1",
        toolName: "bash",
        args: {},
      }),
    );
    events = appendHostEvent(events, runtimeEvent(5, { type: "message.delta", delta: "After" }));

    const msgDeltas = events.filter(
      (e) => e.type === "runtime.event" && e.event.type === "message.delta",
    );
    expect(msgDeltas).toHaveLength(2);
    if (msgDeltas[0]?.type === "runtime.event" && msgDeltas[0].event.type === "message.delta") {
      expect(msgDeltas[0].event.delta).toBe("Hello world");
    }
    if (msgDeltas[1]?.type === "runtime.event" && msgDeltas[1].event.type === "message.delta") {
      expect(msgDeltas[1].event.delta).toBe("After");
    }
  });

  it("still caps non-delta event growth", () => {
    let events: HostEvent[] = [];
    for (let i = 0; i < HOST_EVENT_RETENTION + 50; i++) {
      events = appendHostEvent(events, runtimeEvent(i + 1, { type: "agent.started" }));
    }
    expect(events.length).toBe(HOST_EVENT_RETENTION);
  });
});
