import { notFound } from "next/navigation";
import { MeetingDetail } from "@/components/modules/meetings/MeetingDetail";
import { getMeetingCore } from "@/lib/db/core/meetings";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = await getMeetingCore(id);
  if (!meeting) notFound();
  return <MeetingDetail meeting={meeting} />;
}
