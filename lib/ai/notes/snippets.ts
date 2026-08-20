// Pure text shaping for the chat-style project note composer. Snippets arrive
// one message at a time, so the list — not a single textarea — is the source of
// truth. These helpers turn that list into the two text forms the LLM passes
// need, and are shared by the client composer and the server action, so both
// sides agree on what "the braindump" is.
//
// No AI-SDK imports here on purpose: the composer is a client component and
// must not pull `lib/ai/notes/assist` (and the whole provider graph) into the
// browser bundle.

export function cleanSnippets(snippets: string[]): string[] {
  return snippets.map((s) => s.trim()).filter((s) => s.length > 0);
}

// Numbered, in capture order. The index is what lets the consolidation prompt
// reason about sequence — a later snippet that corrects an earlier one wins.
export function numberSnippets(snippets: string[]): string {
  return cleanSnippets(snippets)
    .map((s, i) => `[${i + 1}] ${s}`)
    .join("\n\n");
}

// Flat braindump — what summarize/extract want, since they only care about the
// content and not the order it was captured in.
export function flattenSnippets(snippets: string[]): string {
  return cleanSnippets(snippets).join("\n\n");
}
