import { describe, it, expect } from "vitest";
import { filterProviders } from "./filter";
import type { ProviderGroup } from "./models";

const GROUPS: ProviderGroup[] = [
  {
    providerId: "anthropic",
    providerName: "Anthropic",
    models: [
      { id: "claude-opus-4-5", name: "Claude Opus 4.5", providerId: "anthropic", providerName: "Anthropic" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", providerId: "anthropic", providerName: "Anthropic" },
    ],
  },
  {
    providerId: "openai",
    providerName: "OpenAI",
    models: [{ id: "o3", name: "o3", family: "o-series", providerId: "openai", providerName: "OpenAI" }],
  },
];

describe("filterProviders", () => {
  it("returns everything unchanged when search text is empty", () => {
    expect(filterProviders(GROUPS, "")).toEqual(GROUPS);
  });

  it("keeps all models of a provider when the provider name matches", () => {
    const result = filterProviders(GROUPS, "anthropic");
    expect(result).toHaveLength(1);
    expect(result[0].models).toHaveLength(2);
  });

  it("keeps only matching models when the match is on model id/name/family", () => {
    const result = filterProviders(GROUPS, "opus");
    expect(result).toHaveLength(1);
    expect(result[0].providerId).toBe("anthropic");
    expect(result[0].models).toEqual([GROUPS[0].models[0]]);
  });

  it("matches case-insensitively and drops providers with no match", () => {
    const result = filterProviders(GROUPS, "O-SERIES");
    expect(result).toHaveLength(1);
    expect(result[0].providerId).toBe("openai");
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterProviders(GROUPS, "nonexistent")).toEqual([]);
  });

  it("treats space-separated terms as AND conditions: provider term + model term narrows within that provider", () => {
    const result = filterProviders(GROUPS, "anthropic opus");
    expect(result).toHaveLength(1);
    expect(result[0].providerId).toBe("anthropic");
    expect(result[0].models).toEqual([GROUPS[0].models[0]]);
  });

  it("treats space-separated terms as AND conditions: two terms both matching the same model name", () => {
    const result = filterProviders(GROUPS, "claude opus");
    expect(result).toHaveLength(1);
    expect(result[0].models).toEqual([GROUPS[0].models[0]]);
  });

  it("AND semantics: a provider term plus a term matching nothing in that provider yields no results", () => {
    expect(filterProviders(GROUPS, "anthropic o-series")).toEqual([]);
  });

  it("collapses extra whitespace between terms and trims the ends", () => {
    const result = filterProviders(GROUPS, "  anthropic   opus  ");
    expect(result).toHaveLength(1);
    expect(result[0].models).toEqual([GROUPS[0].models[0]]);
  });
});
