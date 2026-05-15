import { CronView } from "@/components/modules/cron/CronView";
import { listCronJobsCore } from "@/lib/db/core/cron-jobs";

export const dynamic = "force-dynamic";

export default async function CronPage() {
  const jobs = await listCronJobsCore();
  return <CronView initialJobs={jobs} />;
}
