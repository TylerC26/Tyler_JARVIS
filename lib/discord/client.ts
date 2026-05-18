// Tiny outbound client for Discord. Used to PATCH the deferred interaction
// response after Jarvis finishes generating its reply.

const API_BASE = "https://discord.com/api/v10";

export async function editInteractionResponse(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const url = `${API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Discord caps message content at 2000 characters.
      body: JSON.stringify({ content: content.slice(0, 1990) }),
    });
    if (!res.ok) {
      console.warn("[discord] edit failed:", res.status, await res.text());
    }
  } catch (e) {
    console.warn("[discord] edit threw:", e);
  }
}

// Post a freestanding message to a configured channel webhook. Optional —
// used by the cron path when the user wires DISCORD_NOTIFY_WEBHOOK_URL.
export async function sendDiscordWebhook(
  webhookUrl: string,
  content: string,
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1990) }),
    });
  } catch (e) {
    console.warn("[discord] webhook send threw:", e);
  }
}
