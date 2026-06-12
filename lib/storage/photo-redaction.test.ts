import { afterEach, describe, expect, test } from "vitest";
import {
  isPhotoRedactionEnabled,
  redactPhotoUrlsIfEnabled,
  stripSignedPhotoUrls,
} from "./photo-redaction";

const SIGNED =
  "https://abc.supabase.co/storage/v1/object/sign/progress-photos/u1/2026-06-12-x.jpg?token=eyJhbGciOi";

afterEach(() => {
  delete process.env.PHOTO_REDACTION;
});

describe("stripSignedPhotoUrls", () => {
  test("strips a signed progress-photo URL from a string", () => {
    const out = stripSignedPhotoUrls(`see ${SIGNED} here`);
    expect(out).not.toContain("token=");
    expect(out).toContain("[redacted photo url]");
    expect(out.startsWith("see ")).toBe(true);
  });

  test("walks nested objects and arrays", () => {
    const out = stripSignedPhotoUrls({
      message: `photo at ${SIGNED}`,
      summary: { urls: [SIGNED, "https://example.com/ok.jpg"], n: 3 },
    });
    expect(JSON.stringify(out)).not.toContain("/object/sign/progress-photos/");
    expect(out.summary.urls[1]).toBe("https://example.com/ok.jpg");
    expect(out.summary.n).toBe(3);
  });

  test("leaves unrelated URLs and other buckets alone", () => {
    const mealUrl =
      "https://abc.supabase.co/storage/v1/object/public/meal-photos/a.jpg";
    expect(stripSignedPhotoUrls(mealUrl)).toBe(mealUrl);
  });

  test("passes through null/undefined/numbers", () => {
    expect(stripSignedPhotoUrls(null)).toBeNull();
    expect(stripSignedPhotoUrls(42)).toBe(42);
  });
});

describe("PHOTO_REDACTION flag", () => {
  test("off by default — values pass through untouched", () => {
    expect(isPhotoRedactionEnabled()).toBe(false);
    expect(redactPhotoUrlsIfEnabled(SIGNED)).toBe(SIGNED);
  });

  test("on — values are stripped", () => {
    process.env.PHOTO_REDACTION = "true";
    expect(isPhotoRedactionEnabled()).toBe(true);
    expect(redactPhotoUrlsIfEnabled(SIGNED)).toContain("[redacted photo url]");
  });
});
