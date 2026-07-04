import { describe, expect, it } from "vitest";
import { agentModelId } from "./run";

describe("agentModelId", () => {
  it("legacy 'claude'/'opus'/'sonnet'/'haiku' tiers all resolve to MiniMax", () => {
    expect(agentModelId("claude", true, true)).toBe("MiniMax-M3");
    expect(agentModelId("opus", true, true)).toBe("MiniMax-M3");
    expect(agentModelId("sonnet", true, true)).toBe("MiniMax-M3");
    expect(agentModelId("haiku", true, true)).toBe("MiniMax-M3");
  });
  it("'auto' resolves to MiniMax when it's ready", () => {
    expect(agentModelId("auto", true, true)).toBe("MiniMax-M3");
  });
  it("deepseek pref uses deepseek when it's ready", () => {
    expect(agentModelId("deepseek", true, false)).toBe("deepseek-chat");
  });
  it("deepseek pref falls back to minimax when deepseek is unavailable", () => {
    expect(agentModelId("deepseek", false, true)).toBe("MiniMax-M3");
  });
  it("falls back to deepseek when minimax is not ready", () => {
    expect(agentModelId("sonnet", true, false)).toBe("deepseek-chat");
  });
  it("minimax pref maps to MiniMax-M3 when minimax is ready", () => {
    expect(agentModelId("minimax", true, true)).toBe("MiniMax-M3");
  });
  it("minimax pref falls back to deepseek when minimax is unavailable", () => {
    expect(agentModelId("minimax", true, false)).toBe("deepseek-chat");
  });
  it("returns null when no provider is available", () => {
    expect(agentModelId("auto", false, false)).toBeNull();
    expect(agentModelId("minimax", false, false)).toBeNull();
  });
});
