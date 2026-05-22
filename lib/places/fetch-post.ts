// Server-side reader for forwarded Instagram / Threads posts.
//
// Tyler forwards a post by SHARE LINK — Telegram delivers just the URL as
// text, so to "read" the post Jarvis must fetch it. Neither platform offers a
// keyless public API and both block ordinary scraping — but both still serve
// OpenGraph meta tags to crawler user-agents (that is how their links unfurl
// into a preview inside Telegram, Twitter, etc.). So we fetch the canonical
// post URL with a `facebookexternalhit` user-agent and read og:title /
// og:description / og:image. og:description carries the post caption.
//
// This can still fail (private posts, deleted posts, IP rate-limits).
// fetchPost NEVER throws — it returns a discriminated result and the caller
// degrades gracefully (asks Tyler to name the place himself).

export type PostPlatform = "instagram" | "threads";

export type DetectedPost = {
  platform: PostPlatform;
  url: string; // normalized, tracking-param-free
  shortcode: string;
};

export type FetchedPost =
  | {
      ok: true;
      platform: PostPlatform;
      caption: string;
      imageUrl: string | null;
      handle: string | null;
      locationHint: string | null;
    }
  | {
      ok: false;
      reason: "private" | "blocked" | "not_found" | "unsupported" | "error";
      message: string;
    };

const IG_RE =
  /https?:\/\/(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
const THREADS_RE =
  /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([\w.]+)\/post\/([A-Za-z0-9_-]+)/i;

// Pulls the FIRST Instagram or Threads post URL out of arbitrary text (a
// forwarded message is usually just the bare URL, but may carry a caption).
export function detectPostUrl(text: string): DetectedPost | null {
  if (!text) return null;

  const ig = text.match(IG_RE);
  if (ig) {
    const kind = ig[1].toLowerCase();
    const shortcode = ig[2];
    const path = kind === "reels" ? "reel" : kind;
    return {
      platform: "instagram",
      url: `https://www.instagram.com/${path}/${shortcode}/`,
      shortcode,
    };
  }

  const th = text.match(THREADS_RE);
  if (th) {
    const handle = th[1];
    const shortcode = th[2];
    return {
      platform: "threads",
      url: `https://www.threads.net/@${handle}/post/${shortcode}`,
      shortcode,
    };
  }

  return null;
}

// Crawler UA — Instagram/Threads serve OpenGraph meta to facebookexternalhit
// (their own link-unfurl bot) but not to ordinary browser UAs.
const CRAWLER_HEADERS = {
  "User-Agent": "facebookexternalhit/1.1",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
} as const;

const FETCH_TIMEOUT_MS = 8000;

async function fetchHtml(
  url: string,
): Promise<{ ok: true; html: string } | { ok: false; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: CRAWLER_HEADERS,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, html: await res.text() };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- HTML helpers ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return "";
      }
    })
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, property: string): string | null {
  // Handles both `property="og:x"` and `name="og:x"`, attribute order-agnostic.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]).trim();
  }
  return null;
}

// ---------- Instagram ----------

async function fetchInstagram(post: DetectedPost): Promise<FetchedPost> {
  const res = await fetchHtml(post.url);
  if (!res.ok) {
    if (res.status === 404)
      return { ok: false, reason: "not_found", message: "Post not found." };
    return {
      ok: false,
      reason: "blocked",
      message: `Instagram returned status ${res.status || "no response"}.`,
    };
  }
  const html = res.html;
  const ogTitle = (metaContent(html, "og:title") ?? "").trim();
  const ogDesc = (metaContent(html, "og:description") ?? "").trim();
  const imageUrl = metaContent(html, "og:image");

  // og:description is the richest variant — "<N> likes, <M> comments -
  // <handle> on <date>: "<caption>"". og:title carries a trimmed copy. The
  // extractor strips the engagement boilerplate, so take the longer one.
  const caption = ogDesc.length >= ogTitle.length ? ogDesc : ogTitle;

  // A private / removed post falls back to the generic shell: og:title is
  // just "Instagram" with no real description.
  const isGenericShell = !ogDesc && /^instagram$/i.test(ogTitle);
  if (isGenericShell || (!caption && !imageUrl)) {
    return {
      ok: false,
      reason: "private",
      message: "Could not read the post — it may be private or removed.",
    };
  }

  // The actual @handle: "… - <handle> on <date>:" in the description, or the
  // leading "<name> on Instagram" in the title.
  const handle =
    ogDesc.match(/-\s*([A-Za-z0-9._]+)\s+on\s/)?.[1] ??
    ogTitle.match(/^(.+?)\s+on Instagram/i)?.[1]?.trim() ??
    null;

  return {
    ok: true,
    platform: "instagram",
    caption,
    imageUrl,
    handle,
    locationHint: null,
  };
}

// ---------- Threads ----------

async function fetchThreads(post: DetectedPost): Promise<FetchedPost> {
  const res = await fetchHtml(post.url);
  if (!res.ok) {
    if (res.status === 404)
      return { ok: false, reason: "not_found", message: "Post not found." };
    return {
      ok: false,
      reason: "blocked",
      message: `Threads returned status ${res.status || "no response"}.`,
    };
  }
  const html = res.html;
  const ogTitle = (metaContent(html, "og:title") ?? "").trim();
  const ogDesc = (metaContent(html, "og:description") ?? "").trim();
  const imageUrl = metaContent(html, "og:image");

  // A private / removed post falls back to the generic Threads landing page
  // ("Threads" title, "Join Threads to share ideas…" description).
  const isGenericShell =
    /^threads$/i.test(ogTitle) ||
    /^join threads to share ideas/i.test(ogDesc);
  if (isGenericShell || (!ogDesc && !imageUrl)) {
    return {
      ok: false,
      reason: "private",
      message: "Could not read the post — it may be private or removed.",
    };
  }

  return {
    ok: true,
    platform: "threads",
    caption: ogDesc || ogTitle,
    imageUrl,
    // The @handle is right there in the canonical URL.
    handle: post.url.match(/@([\w.]+)/)?.[1] ?? null,
    locationHint: null,
  };
}

// Fetch + parse a forwarded post. Never throws.
export async function fetchPost(url: string): Promise<FetchedPost> {
  const post = detectPostUrl(url);
  if (!post) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Not a recognized Instagram or Threads post URL.",
    };
  }
  try {
    return post.platform === "instagram"
      ? await fetchInstagram(post)
      : await fetchThreads(post);
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      message: e instanceof Error ? e.message : "Fetch failed.",
    };
  }
}
