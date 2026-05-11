import { listActiveSkills } from "@/lib/db/queries/skills";
import type { Skill } from "@/lib/db/types";

const MAX_SKILLS_PER_TURN = 3;

// Decide which active skills apply to the user's latest turn. v1 is keyword
// only — substring-match the latest user message (case-insensitive) against
// each skill's trigger list. Capped at MAX_SKILLS_PER_TURN to keep the
// system-prompt footprint bounded; ties broken alphabetically by name.
export async function resolveActiveSkillsForTurn(
  userText: string,
): Promise<{ matched: Skill[]; allActive: Skill[] }> {
  const allActive = await listActiveSkills();
  if (!userText || allActive.length === 0)
    return { matched: [], allActive };

  const haystack = userText.toLowerCase();
  const matched = allActive
    .filter((s) =>
      s.trigger_keywords.some((kw) => kw && haystack.includes(kw.toLowerCase())),
    )
    .slice(0, MAX_SKILLS_PER_TURN);

  return { matched, allActive };
}

// Render the skills block that gets appended to the chat context prefix. Two
// sections: a one-liner listing every active skill (so the model knows what's
// available) and the full instruction text for the skills that matched this
// turn's keywords.
export function renderSkillsBlock(
  matched: Skill[],
  allActive: Skill[],
): string {
  if (allActive.length === 0) return "";

  const inventoryLine = `Skills available: ${allActive
    .map((s) => `${s.name} — ${s.description}`)
    .join(" · ")}`;

  if (matched.length === 0) {
    return `\n\n${inventoryLine}\nNo Skills triggered for this turn (none of their keywords matched the latest message).`;
  }

  const activated = matched
    .map(
      (s) =>
        `### ${s.name}\n${s.description}\n\n${s.instructions.trim()}`,
    )
    .join("\n\n---\n\n");

  return `\n\n${inventoryLine}\n\nSkills active for this turn:\n${activated}`;
}
