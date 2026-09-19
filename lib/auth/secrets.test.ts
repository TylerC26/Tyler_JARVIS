import { describe, expect, it } from "vitest";
import { bearerMatches, secretsMatch } from "./secrets";

describe("secretsMatch", () => {
  it("matches identical secrets", () => {
    expect(secretsMatch("s3cret", "s3cret")).toBe(true);
  });

  it("rejects different secrets", () => {
    expect(secretsMatch("s3cret", "s3crey")).toBe(false);
  });

  it("rejects on length mismatch without throwing", () => {
    expect(secretsMatch("short", "muchlonger")).toBe(false);
  });

  // The regression this module exists for: an unset env var must never
  // authenticate anything.
  it("rejects when the expected value is missing", () => {
    expect(secretsMatch("anything", undefined)).toBe(false);
    expect(secretsMatch("anything", null)).toBe(false);
    expect(secretsMatch("anything", "")).toBe(false);
  });

  it("rejects the literal string 'undefined'", () => {
    expect(secretsMatch("undefined", process.env.DEFINITELY_UNSET)).toBe(false);
  });
});

describe("bearerMatches", () => {
  it("accepts a correct bearer token", () => {
    expect(bearerMatches("Bearer tok123", "tok123")).toBe(true);
  });

  it("is case-insensitive on the scheme and tolerates extra spacing", () => {
    expect(bearerMatches("bearer   tok123", "tok123")).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(bearerMatches("Bearer nope123", "tok123")).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(bearerMatches(null, "tok123")).toBe(false);
    expect(bearerMatches("tok123", "tok123")).toBe(false);
    expect(bearerMatches("Basic tok123", "tok123")).toBe(false);
  });

  // "Bearer undefined" is exactly what the old inline check accepted when
  // CRON_SECRET was unset.
  it("rejects 'Bearer undefined' when the secret is unset", () => {
    expect(bearerMatches("Bearer undefined", undefined)).toBe(false);
  });
});
