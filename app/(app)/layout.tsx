import {
  ChatLauncher,
  type LauncherAgent,
} from "@/components/shell/ChatLauncher";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { ConfirmHost } from "@/components/ui/ConfirmDialog";
import { resolveAgentModelId } from "@/lib/ai/agents/run";
import { listActiveAgents } from "@/lib/db/queries/agents";

// The docked launcher defaults certain pages to a sub-agent thread (work
// projects → Claudia, repo tasks → Developer, …) and lets the user pick any
// agent from its strip, so ship the full active roster with name/color/model.
// Best-effort: a DB hiccup degrades the launcher to main Jarvis, never breaks
// the shell.
async function loadLauncherAgents(): Promise<LauncherAgent[]> {
  try {
    const agents = await listActiveAgents();
    return await Promise.all(
      agents.map(async (a) => ({
        slug: a.slug,
        name: a.name,
        description: a.description,
        color: a.color,
        modelId: await resolveAgentModelId(a),
        // Same gate as /chat: image upload follows the OCR/vision allowlist.
        imageUploadEnabled: (a.tool_allowlist ?? []).some(
          (t) => t === "ocr_extract" || t === "vision_analyze",
        ),
      })),
    );
  } catch (e) {
    console.warn("[shell] could not load launcher agents:", e);
    return [];
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
  };
  const launcherAgents = await loadLauncherAgents();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-x-hidden px-4 py-5 pb-6 md:px-6">
          {children}
        </main>
      </div>
      <ChatLauncher configured={configured} agents={launcherAgents} />
      <ConfirmHost />
    </div>
  );
}
