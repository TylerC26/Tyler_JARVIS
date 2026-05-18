import { CronView } from "@/components/modules/cron/CronView";
import {
  listCronJobsCore,
  seedDefaultCronJobsCore,
} from "@/lib/db/core/cron-jobs";

export const dynamic = "force-dynamic";

export default async function CronPage() {
  // Idempotent: only inserts the seeded job(s) the first time the owner opens
  // this page. Skipped after that.
  await seedDefaultCronJobsCore();
  const jobs = await listCronJobsCore();
  return <CronView initialJobs={jobs} />;
}
