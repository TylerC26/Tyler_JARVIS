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
  trend_vs_prior:
    "Baseline read — no prior photo on file, so this becomes the reference point.",
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
  test("single photo: one image part, trend_vs_prior still required", async () => {
    generateObjectMock.mockResolvedValue({
      object: VALID_ANALYSIS,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const r = await analyzePhysiquePhoto({ imageUrl: "https://x.test/b.jpg" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.trend_vs_prior).toMatch(/baseline/i);

    const call = generateObjectMock.mock.calls[0][0];
    expect(imageParts(call)).toHaveLength(1);
    expect(call.schema.shape.trend_vs_prior).toBeDefined();
  });

  test("with priorPhotoUrl: sends both images, trend describes the comparison", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        ...VALID_ANALYSIS,
        trend_vs_prior:
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
    expect(r.data.trend_vs_prior).toMatch(/prior/);

    const call = generateObjectMock.mock.calls[0][0];
    expect(imageParts(call)).toHaveLength(2);
  });

  test("estimated_bf_range is optional — a rangeless analysis passes", async () => {
    const { estimated_bf_range: _drop, ...rangeless } = VALID_ANALYSIS;
    generateObjectMock.mockResolvedValue({ object: rangeless, usage: {} });

    const r = await analyzePhysiquePhoto({ imageUrl: "https://x.test/b.jpg" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.estimated_bf_range).toBeUndefined();
  });

  test("a payload missing trend_vs_prior is rejected", async () => {
    const { trend_vs_prior: _drop, ...noTrend } = VALID_ANALYSIS;
    generateObjectMock.mockResolvedValue({ object: noTrend, usage: {} });

    const r = await analyzePhysiquePhoto({ imageUrl: "https://x.test/b.jpg" });
    expect(r.ok).toBe(false);
  });

  test("an inverted bf range is still rejected when present", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        ...VALID_ANALYSIS,
        estimated_bf_range: { low: 22, high: 14 },
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
  test("requires trend_vs_prior, allows missing bf range", () => {
    expect(physiqueAnalysisSchema.safeParse(VALID_ANALYSIS).success).toBe(true);
    const { estimated_bf_range: _r, ...rangeless } = VALID_ANALYSIS;
    expect(physiqueAnalysisSchema.safeParse(rangeless).success).toBe(true);
    const { trend_vs_prior: _t, ...trendless } = VALID_ANALYSIS;
    expect(physiqueAnalysisSchema.safeParse(trendless).success).toBe(false);
  });

  test("rejects unknown lighting values", () => {
    expect(
      physiqueAnalysisSchema.safeParse({
        ...VALID_ANALYSIS,
        lighting_quality: "amazing",
      }).success,
    ).toBe(false);
  });
});
