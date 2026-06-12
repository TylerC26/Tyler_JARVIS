import { describe, expect, test } from "vitest";
import {
  MAX_PROGRESS_PHOTO_BYTES,
  validateProgressPhotoFile,
} from "./progress-photos";

const MB = 1024 * 1024;

describe("validateProgressPhotoFile", () => {
  test("accepts an image at or under 10MB", () => {
    expect(
      validateProgressPhotoFile({ size: 3 * MB, type: "image/jpeg" }),
    ).toBeNull();
    expect(
      validateProgressPhotoFile({ size: MAX_PROGRESS_PHOTO_BYTES, type: "image/png" }),
    ).toBeNull();
  });

  test("rejects files over 10MB with the size in the message", () => {
    const err = validateProgressPhotoFile({
      size: 12.4 * MB,
      type: "image/jpeg",
    });
    expect(err).toMatch(/12\.4MB/);
    expect(err).toMatch(/10MB/);
  });

  test("rejects non-image MIME types", () => {
    expect(
      validateProgressPhotoFile({ size: MB, type: "application/pdf" }),
    ).toMatch(/image/i);
    expect(validateProgressPhotoFile({ size: MB, type: "" })).toMatch(/image/i);
  });

  test("rejects empty files", () => {
    expect(
      validateProgressPhotoFile({ size: 0, type: "image/jpeg" }),
    ).toMatch(/empty/i);
  });
});
