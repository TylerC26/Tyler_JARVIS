import { ChatPanel } from "@/components/modules/chat/ChatPanel";
import { listMessages } from "@/lib/chat/persist";
import { dbToUIMessages } from "@/lib/chat/ui";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const dbMessages = await listMessages();
  const initialMessages = dbToUIMessages(dbMessages);
  const configured = Boolean(process.env.OPENROUTER_API_KEY);

  return (
    <div className="h-[calc(100vh-3.5rem-2.5rem)] md:h-[calc(100vh-3.5rem-3rem)]">
      <ChatPanel
        initialMessages={initialMessages}
        configured={configured}
        variant="page"
      />
    </div>
  );
}
