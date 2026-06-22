import type { ProviderGroup } from "./models";

export function filterProviders(groups: ProviderGroup[], searchText: string): ProviderGroup[] {
  const term = searchText.trim().toLowerCase();
  if (!term) {
    return groups;
  }

  return groups.flatMap((group) => {
    const providerMatches =
      group.providerId.toLowerCase().includes(term) || group.providerName.toLowerCase().includes(term);

    if (providerMatches) {
      return [group];
    }

    const matchingModels = group.models.filter(
      (model) =>
        model.id.toLowerCase().includes(term) ||
        model.name.toLowerCase().includes(term) ||
        (model.family ?? "").toLowerCase().includes(term),
    );

    return matchingModels.length > 0 ? [{ ...group, models: matchingModels }] : [];
  });
}
