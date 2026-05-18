// Ed25519 signature verification for Discord interactions. Discord signs every
// interaction with its application public key; rejecting unsigned requests is
// a hard requirement for the interactions endpoint to be accepted.
//
// Uses Web Crypto (available in Node 18+ runtimes via globalThis.crypto) so no
// extra dependency is needed.

function hexToBuffer(hex: string): ArrayBuffer {
  const clean = hex.trim();
  const buf = new ArrayBuffer(clean.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

function stringToBuffer(s: string): ArrayBuffer {
  const view = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

export async function verifyDiscordRequest(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): Promise<boolean> {
  try {
    const publicKey = hexToBuffer(publicKeyHex);
    const signature = hexToBuffer(signatureHex);
    const message = stringToBuffer(timestamp + rawBody);

    const key = await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("Ed25519", key, signature, message);
  } catch (e) {
    console.warn("[discord.verify] failed:", e);
    return false;
  }
}
