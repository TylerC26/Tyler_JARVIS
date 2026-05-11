import { SkillsView } from "@/components/modules/skills/SkillsView";
import { seedDefaultSkillsCore } from "@/lib/db/core/skills";
import { listAllSkills } from "@/lib/db/queries/skills";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  // Idempotent: only inserts the 4 seed skills the first time Tyler opens this
  // page. Skipped after that.
  await seedDefaultSkillsCore();
  const skills = await listAllSkills();
  return <SkillsView initialSkills={skills} />;
}
