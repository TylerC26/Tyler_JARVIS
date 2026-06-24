import { describe, expect, it } from "vitest";
import { resolveModelId, forceRouteForPref } from "./model-prefs";

describe("resolveModelId", () => {
  it("auto uses the coded default tier", () => {
    expect(resolveModelId("auto", "sonnet", false)).toBe("claude-sonnet-4-6");
    expect(resolveModelId("auto", "haiku", false)).toBe("claude-haiku-4-5");
    expect(resolveModelId("auto", "opus", false)).toBe("claude-opus-4-7");
  });

  it("an explicit pref overrides the default", () => {
    expect(resolveModelId("haiku", "opus", false)).toBe("claude-haiku-4-5");
    expect(resolveModelId("deepseek", "sonnet", false)).toBe("deepseek-chat");
  });

  it("drops a deepseek pref back to default for vision features", () => {
    expect(resolveModelId("deepseek", "sonnet", true)).toBe("claude-sonnet-4-6");
  });
});

describe("forceRouteForPref", () => {
  it("auto yields undefined so the classifier runs", () => {
    expect(forceRouteForPref("auto")).toBeUndefined();
  });
  it("an explicit pref maps straight to a ForceRoute", () => {
    expect(forceRouteForPref("opus")).toBe("opus");
    expect(forceRouteForPref("deepseek")).toBe("deepseek");
  });
});
