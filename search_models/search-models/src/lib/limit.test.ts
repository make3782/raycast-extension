import { describe, it, expect } from "vitest";
import { limitResults } from "./limit";
import type { ProviderGroup } from "./models";

function group(providerId: string, modelIds: string[]): ProviderGroup {
  return {
    providerId,
    providerName: providerId,
    models: modelIds.map((id) => ({ id, name: id, providerId, providerName: providerId })),
  };
}

describe("limitResults", () => {
  it("returns everything unchanged when total is at or below the cap", () => {
    const groups = [group("a", ["a1", "a2"]), group("b", ["b1"])];
    const result = limitResults(groups, 10);
    expect(result.groups).toEqual(groups);
    expect(result.totalCount).toBe(3);
    expect(result.shownCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("trims a group's models when the cap is reached mid-group", () => {
    const groups = [group("a", ["a1", "a2", "a3"]), group("b", ["b1", "b2"])];
    const result = limitResults(groups, 2);
    expect(result.groups).toEqual([group("a", ["a1", "a2"])]);
    expect(result.totalCount).toBe(5);
    expect(result.shownCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("drops groups entirely once the cap is already reached", () => {
    const groups = [group("a", ["a1", "a2"]), group("b", ["b1"])];
    const result = limitResults(groups, 2);
    expect(result.groups.map((g) => g.providerId)).toEqual(["a"]);
    expect(result.totalCount).toBe(3);
    expect(result.shownCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("never returns an empty group when trimming", () => {
    const groups = [group("a", ["a1"]), group("b", ["b1", "b2"])];
    const result = limitResults(groups, 1);
    expect(result.groups).toEqual([group("a", ["a1"])]);
    expect(result.shownCount).toBe(1);
  });

  it("handles an empty input", () => {
    const result = limitResults([], 50);
    expect(result.groups).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.shownCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
