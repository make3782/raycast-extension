import { describe, it, expect } from "vitest";
import { formatPriceAccessory, buildProviderModelId, buildProviderLogoUrl } from "./format";

describe("formatPriceAccessory", () => {
  it("formats input/output cost as a per-1M-token string", () => {
    expect(formatPriceAccessory({ input: 5, output: 25 })).toBe("$5 / $25 per 1M");
  });

  it("uses an em dash for a missing side", () => {
    expect(formatPriceAccessory({ input: 5 })).toBe("$5 / — per 1M");
    expect(formatPriceAccessory({ output: 25 })).toBe("— / $25 per 1M");
  });

  it("returns undefined when cost is missing entirely", () => {
    expect(formatPriceAccessory(undefined)).toBeUndefined();
    expect(formatPriceAccessory({})).toBeUndefined();
  });
});

describe("buildProviderModelId", () => {
  it("joins provider id and model id with a slash", () => {
    expect(buildProviderModelId("anthropic", "claude-opus-4-5")).toBe("anthropic/claude-opus-4-5");
  });
});

describe("buildProviderLogoUrl", () => {
  it("builds a models.dev logo URL for the provider id", () => {
    expect(buildProviderLogoUrl("anthropic")).toBe("https://models.dev/logos/anthropic.svg");
  });
});
