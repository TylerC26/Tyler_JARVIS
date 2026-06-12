import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the AI SDK boundary: tests exercise prompt construction, schema
// selection, and validation — not the network.
const { generateObjectMock, recordModelUsageMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
  recordModelUsageMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: generateObjectMock }));
vi.mock("@/lib/chat/router", () => ({
  recordModelUsage: recordModelUsageMock,
}));

import { analyzePhysiquePhoto, physiqueAnalysisSchema } from "./analyze";

const VALID_ANALYSIS = {
  overall_impression:
    "Appears leaner through the midsection than the typical intake photo, with visible upper-body development.",
  visible_muscle_groups: ["shoulders", "chest", "abs"],
  estimated_bf_range: { low: 15, high: 18 },
  posture_notes: "A slight forward shoulder roll appears present in this pose.",
  lighting_quality: "good",
};

type ImagePart = { type: string };

function imageParts(call: { messages: Array<{ content: ImagePart[] }> }) {
  return call.messages[0].content.filter((p) => p.type === "image");
}

beforeEach(() => {
  generateObjectMock.mockReset();
  recordModelUsageMock.mockReset();
});

describe("analyzePhysiquePhoto", () => {
  test("returns schema-validated analysis for a single photo, no delta field", async () => {
    generateObjectMock.mockResolvedValue({
      object: VALID_ANALYSIS,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const r = await analyzePhysiquePhoto({ imageUrl: "https://x.test/b.jpg" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.estimated_bf_range).toEqual({ low: 15, high: 18 });
    expect(r.data.delta_vs_prior).toBeUndefined();

    const call = generateObjectMock.mock.calls[0][0];
    expect(imageParts(call)).toHaveLength(1);
    // without a prior photo the schema must not ask for a delta
    expect(call.schema.shape.delta_vs_prior).toBeUndefined();
  });

  test("with priorPhotoUrl: sends both images and requires delta_vs_prior", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        ...VALID_ANALYSIS,
        delta_vs_prior:
          "Waist appears slightly tighter than in the prior photo.",
      },
      usage: {},
    });

    const r = await analyzePhysiquePhoto({
      imageUrl: "https://x.test/b.jpg",
      priorPhotoUrl: "https://x.test/a.jpg",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.delta_vs_prior).toMatch(/prior/);

    const call = generateObjectMock.mock.calls[0][0];
    expect(imageParts(call)).toHaveLength(2);
    expect(call.schema.shape.delta_vs_prior).toBeDefined();
  });

  test("rejects a malformed model payload instead of passing it through", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        ...VALID_ANALYSIS,
        estimated_bf_range: { low: 22, high: 14 }, // inverted range
      },
      usage: {},
    });

    const r = await analyzePhysiquePhoto({ imageUrl: "https://x.test/b.jpg" });
    expect(r.ok).toBe(false);
  });

  test("returns ok:false when the API call throws", async () => {
    generateObjectMock.mockRejectedValue(new Error("overloaded"));
    const r = await analyzePhysiquePhoto({ imageUrl: "https://x.test/b.jpg" });
    expect(r).toEqual({ ok: false, error: "overloaded" });
  });
});

describe("physiqueAnalysisSchema", () => {
  test("accepts a well-formed analysis", () => {
    expect(physiqueAnalysisSchema.safeParse(VALID_ANALYSIS).success).toBe(true);
  });

  test("rejects inverted or implausible bf ranges and unknown lighting values", () => {
    expect(
      physiqueAnalysisSchema.safeParse({
        ...VALID_ANALYSIS,
        estimated_bf_range: { low: 18, high: 15 },
      }).success,
    ).toBe(false);
    expect(
      physiqueAnalysisSchema.safeParse({
        ...VALID_ANALYSIS,
        estimated_bf_range: { low: 0, high: 90 },
      }).success,
    ).toBe(false);
    expect(
      physiqueAnalysisSchema.safeParse({
        ...VALID_ANALYSIS,
        lighting_quality: "amazing",
      }).success,
    ).toBe(false);
  });
});
