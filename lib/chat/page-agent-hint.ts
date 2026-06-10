// Client-side override channel for the chatbox's page→agent default. The
// path-based map (page-agents.ts) can't see page DATA — e.g. /projects/[slug]
// hosts both WORK projects (→ Claudia) and ventures (→ Developer). A page that
// knows better mounts <PageAgentHint agent="…"/> (components/modules/chat),
// which writes here; the ChatLauncher subscribes via useSyncExternalStore and
// prefers the hint over the path map. Null = no hint, fall back to the map.

type Listener = () => void;

let hint: string | null = null;
const listeners = new Set<Listener>();

export function setPageAgentHint(slug: string | null): void {
  if (hint === slug) return;
  hint = slug;
  for (const l of listeners) l();
}

export function getPageAgentHint(): string | null {
  return hint;
}

// Server snapshot for useSyncExternalStore — hints only exist client-side.
export function getServerPageAgentHint(): null {
  return null;
}

export function subscribePageAgentHint(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
