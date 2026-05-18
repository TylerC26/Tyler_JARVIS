import { SkillsView } from "@/components/modules/skills/SkillsView";
import { seedDefaultSkillsCore } from "@/lib/db/core/skills";
import { getHarmfulRunCritiqueCore } from "@/lib/db/core/skill-usages";
import { listAllSkills } from "@/lib/db/queries/skills";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  // Idempotent: only inserts the 4 seed skills the first time Tyler opens this
  // page. Skipped after that.
  await seedDefaultSkillsCore();
  const skills = await listAllSkills();

  // For each active skill, surface the latest critique if its last 3 uses
  // were judged harmful. Map shape: { [skill_id]: critique }. Drives a small
  // refinement banner under the affected row in the UI.
  const critiqueEntries = await Promise.all(
    skills
      .filter((s) => s.active)
      .map(async (s) => [s.id, await getHarmfulRunCritiqueCore(s.id)] as const),
  );
  const refinementCritiques: Record<string, string> = {};
  for (const [id, critique] of critiqueEntries) {
    if (critique) refinementCritiques[id] = critique;
  }

  return (
    <SkillsView
      initialSkills={skills}
      refinementCritiques={refinementCritiques}
    />
  );
}
