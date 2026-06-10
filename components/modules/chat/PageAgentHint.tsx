"use client";

import { useEffect } from "react";
import { setPageAgentHint } from "@/lib/chat/page-agent-hint";

// Renders nothing — declares which sub-agent the docked chatbox should default
// to while this page is mounted. For data-aware overrides the path map can't
// make (e.g. a project detail page routing WORK projects to Claudia and
// ventures to Developer). Cleared on unmount so the next page falls back to
// its own mapping.
export function PageAgentHint({ agent }: { agent: string | null }) {
  useEffect(() => {
    setPageAgentHint(agent);
    return () => setPageAgentHint(null);
  }, [agent]);
  return null;
}
