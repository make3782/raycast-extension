import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchModels, toProviderGroups } from "./models";

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

describe("toProviderGroups", () => {
  it("groups by provider, sorts providers and models by name, and attaches provider info to each model", () => {
    const data = {
      beta: {
        id: "beta",
        name: "Beta Labs",
        doc: "https://beta.example/docs",
        models: {
          "beta-mini": { id: "beta-mini", name: "Beta Mini" },
        },
      },
      acme: {
        id: "acme",
        name: "Acme AI",
        models: {
          "acme-small": { id: "acme-small", name: "Acme Small" },
          "acme-large": { id: "acme-large", name: "Acme Large" },
        },
      },
    };

    const groups = toProviderGroups(data);

    expect(groups.map((g) => g.providerId)).toEqual(["acme", "beta"]);
    expect(groups[0].models.map((m) => m.id)).toEqual(["acme-large", "acme-small"]);
    expect(groups[0].models[0]).toMatchObject({
      providerId: "acme",
      providerName: "Acme AI",
      providerDoc: undefined,
    });
    expect(groups[1].models[0]).toMatchObject({
      providerId: "beta",
      providerName: "Beta Labs",
      providerDoc: "https://beta.example/docs",
    });
  });
});
