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
    expect(resolveModelId("minimax", "sonnet", false)).toBe("MiniMax-M3");
  });

  it("drops a text-only pref back to default for vision features", () => {
    expect(resolveModelId("deepseek", "sonnet", true)).toBe("claude-sonnet-4-6");
    // MiniMax-M3 is multimodal upstream but treated as text-only here, so
    // vision call-sites fall back to the coded default the same way.
    expect(resolveModelId("minimax", "opus", true)).toBe("claude-opus-4-7");
  });
});

describe("forceRouteForPref", () => {
  it("auto yields undefined so the classifier runs", () => {
    expect(forceRouteForPref("auto")).toBeUndefined();
  });
  it("an explicit pref maps straight to a ForceRoute", () => {
    expect(forceRouteForPref("opus")).toBe("opus");
    expect(forceRouteForPref("deepseek")).toBe("deepseek");
    expect(forceRouteForPref("minimax")).toBe("minimax");
  });
});
