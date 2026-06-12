import { beforeEach, describe, expect, test, vi } from "vitest";

const { generateObjectMock, getPhotoMock, signMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
  getPhotoMock: vi.fn(),
  signMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: generateObjectMock }));
vi.mock("@/lib/chat/router", () => ({ recordModelUsage: vi.fn() }));
vi.mock("@/lib/db/core/progress-photos", () => ({
  getProgressPhoto: getPhotoMock,
}));
vi.mock("@/lib/storage/progress-photos", () => ({
  signProgressPhotoUrl: signMock,
}));

import { comparePhysiquePhotos, physiqueCompareSchema } from "./compare";

const CURRENT = {
  id: "cur1",
  storage_path: "owner/2026-06-12-b.jpg",
  taken_at: "2026-06-12T08:00:00Z",
};
const PRIOR = {
  id: "pri1",
  storage_path: "owner/2026-05-12-a.jpg",
  taken_at: "2026-05-12T08:00:00Z",
};

const VALID = {
  deltas: ["Waist appears slightly tighter", "Shoulders look a touch fuller"],
  overall_direction: "improved",
  confidence: "med",
};

beforeEach(() => {
  generateObjectMock.mockReset();
  getPhotoMock.mockReset();
  signMock.mockReset();
  getPhotoMock.mockImplementation(async (id: string) =>
    id === "cur1" ? CURRENT : id === "pri1" ? PRIOR : null,
  );
  signMock.mockImplementation(
    async (path: string) => `https://signed.example/${path}`,
  );
});

describe("comparePhysiquePhotos", () => {
  test("loads both photos, signs fresh URLs, returns validated result", async () => {
    generateObjectMock.mockResolvedValue({ object: VALID, usage: {} });

    const r = await comparePhysiquePhotos({ currentId: "cur1", priorId: "pri1" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.overall_direction).toBe("improved");
    expect(r.data.deltas).toHaveLength(2);

    expect(signMock).toHaveBeenCalledWith(CURRENT.storage_path);
    expect(signMock).toHaveBeenCalledWith(PRIOR.storage_path);

    const call = generateObjectMock.mock.calls[0][0];
    const parts = call.messages[0].content as Array<{ type: string }>;
    expect(parts.filter((p) => p.type === "image")).toHaveLength(2);
  });

  test("errors when either photo id does not exist", async () => {
    const r = await comparePhysiquePhotos({ currentId: "cur1", priorId: "nope" });
    expect(r.ok).toBe(false);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  test("errors when a signed URL cannot be minted (e.g. foreign path)", async () => {
    signMock.mockResolvedValue(null);
    const r = await comparePhysiquePhotos({ currentId: "cur1", priorId: "pri1" });
    expect(r.ok).toBe(false);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  test("rejects a malformed model payload", async () => {
    generateObjectMock.mockResolvedValue({
      object: { ...VALID, overall_direction: "way better" },
      usage: {},
    });
    const r = await comparePhysiquePhotos({ currentId: "cur1", priorId: "pri1" });
    expect(r.ok).toBe(false);
  });

  test("returns ok:false when the API call throws", async () => {
    generateObjectMock.mockRejectedValue(new Error("overloaded"));
    const r = await comparePhysiquePhotos({ currentId: "cur1", priorId: "pri1" });
    expect(r).toEqual({ ok: false, error: "overloaded" });
  });
});

describe("physiqueCompareSchema", () => {
  test("accepts valid payloads, rejects bad enums and empty deltas", () => {
    expect(physiqueCompareSchema.safeParse(VALID).success).toBe(true);
    expect(
      physiqueCompareSchema.safeParse({ ...VALID, confidence: "certain" })
        .success,
    ).toBe(false);
    expect(
      physiqueCompareSchema.safeParse({ ...VALID, deltas: [] }).success,
    ).toBe(false);
  });
});
