import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchModels } from "./models";

const SAMPLE_RESPONSE = {
  acme: {
    id: "acme",
    name: "Acme AI",
    doc: "https://acme.example/docs",
    models: {
      "acme-large": {
        id: "acme-large",
        name: "Acme Large",
        cost: { input: 5, output: 25 },
      },
    },
  },
};

describe("fetchModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed JSON when the request succeeds", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_RESPONSE,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchModels();

    expect(result).toEqual(SAMPLE_RESPONSE);
    expect(mockFetch).toHaveBeenCalledWith("https://models.dev/api.json");
  });

  it("throws when the request fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchModels()).rejects.toThrow("models.dev request failed: 503");
  });
});
