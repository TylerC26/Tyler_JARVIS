import { describe, expect, it } from "vitest";
import { agentModelId } from "./run";

describe("agentModelId", () => {
  it("legacy 'claude' maps to opus", () => {
    expect(agentModelId("claude", true, true)).toBe("claude-opus-4-7");
  });
  it("'auto' maps to sonnet when Claude is ready", () => {
    expect(agentModelId("auto", true, true)).toBe("claude-sonnet-4-6");
  });
  it("explicit tiers map straight through", () => {
    expect(agentModelId("haiku", true, false)).toBe("claude-haiku-4-5");
    expect(agentModelId("opus", true, false)).toBe("claude-opus-4-7");
  });
  it("deepseek pref falls back to opus when deepseek is unavailable", () => {
    expect(agentModelId("deepseek", true, false)).toBe("claude-opus-4-7");
  });
  it("falls back to deepseek when Claude is not ready", () => {
    expect(agentModelId("sonnet", false, true)).toBe("deepseek-chat");
  });
  it("returns null when no provider is available", () => {
    expect(agentModelId("auto", false, false)).toBeNull();
  });
});
