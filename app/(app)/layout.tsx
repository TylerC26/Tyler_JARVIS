import { ChatLauncher } from "@/components/shell/ChatLauncher";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-x-hidden px-4 py-5 pb-6 md:px-6">
          {children}
        </main>
      </div>
      <ChatLauncher configured={configured} />
    </div>
  );
}
