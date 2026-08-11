import { describe, expect, it } from "vite-plus/test";
import {
  attachmentPresentation,
  SUPPORTED_ATTACHMENT_EXTENSIONS,
} from "./lib/composer-suggestions.ts";
import {
  DEMO_USER_ATTACHMENT_PATHS,
  scenarioLiveQueue,
  scenarioPausedQueue,
  scenarioUserAttachments,
} from "./session-content-demo-fixtures.ts";

describe("session content demo attachment coverage", () => {
  it("includes every recognized extension plus folder and generic fallbacks", () => {
    expect(DEMO_USER_ATTACHMENT_PATHS).toHaveLength(SUPPORTED_ATTACHMENT_EXTENSIONS.length + 2);

    const presentations = DEMO_USER_ATTACHMENT_PATHS.map(attachmentPresentation);
    expect(presentations.some((item) => item.kind === "folder")).toBe(true);
    expect(presentations.some((item) => item.kind === "file")).toBe(true);

    for (const extension of SUPPORTED_ATTACHMENT_EXTENSIONS) {
      expect(DEMO_USER_ATTACHMENT_PATHS).toContainEqual(
        expect.stringMatching(new RegExp(`\\.${extension}$`, "i")),
      );
    }
  });

  it("feeds the full attachment set through a real user timeline item", () => {
    const userItem = scenarioUserAttachments().items.find((item) => item.kind === "user");
    expect(userItem?.kind).toBe("user");
    if (userItem?.kind !== "user") throw new Error("User attachment fixture is missing");
    expect(userItem.attachments).toEqual(DEMO_USER_ATTACHMENT_PATHS);
  });
});

describe("session content demo queue coverage", () => {
  it("exposes steer rows without painting them as timeline user rows", () => {
    const scenario = scenarioLiveQueue();
    expect(scenario.running).toBe(true);
    expect(scenario.queuePaused).toBeFalsy();
    expect(scenario.queuedMessages?.steering).toEqual(["4", "5", "6"]);

    const queueTexts = [...(scenario.queuedMessages?.steering ?? [])];
    const userTexts = scenario.items
      .filter((item) => item.kind === "user")
      .map((item) => (item.kind === "user" ? item.text : ""));

    for (const text of queueTexts) {
      expect(userTexts.some((user) => user === text || user.includes(text))).toBe(false);
    }
  });

  it("includes a paused queue fixture matching the interrupted-response strip", () => {
    const scenario = scenarioPausedQueue();
    expect(scenario.queuePaused).toBe(true);
    expect(scenario.running).toBe(false);
    expect(scenario.queuedMessages?.steering).toEqual(["5", "6"]);
  });
});
