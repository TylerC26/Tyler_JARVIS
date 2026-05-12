import { ALL_TOOLS, type ToolName } from "@/lib/chat/tools";

export const ALL_TOOL_NAMES = Object.keys(ALL_TOOLS) as ToolName[];

// Filter ALL_TOOLS down to the agent's allowlist. Unknown names are silently
// dropped (the DB layer doesn't validate, so this is the runtime guard).
export function getToolsForAgent(allowlist: string[]): Partial<typeof ALL_TOOLS> {
  const allowed = new Set(allowlist);
  const subset: Record<string, unknown> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (allowed.has(name)) subset[name] = ALL_TOOLS[name];
  }
  return subset as Partial<typeof ALL_TOOLS>;
}
