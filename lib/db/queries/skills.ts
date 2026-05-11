import { listSkillsCore } from "@/lib/db/core/skills";
import type { Skill } from "@/lib/db/types";

export async function listActiveSkills(): Promise<Skill[]> {
  return listSkillsCore({ activeOnly: true });
}

export async function listAllSkills(): Promise<Skill[]> {
  return listSkillsCore();
}
