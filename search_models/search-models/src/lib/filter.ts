import type { ModelWithProvider, ProviderGroup } from "./models";

function modelMatchesTerm(model: ModelWithProvider, term: string): boolean {
  return (
    model.id.toLowerCase().includes(term) ||
    model.name.toLowerCase().includes(term) ||
    (model.family ?? "").toLowerCase().includes(term)
  );
}

export function filterProviders(groups: ProviderGroup[], searchText: string): ProviderGroup[] {
  const terms = searchText.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return groups;
  }

  return groups.flatMap((group) => {
    const providerId = group.providerId.toLowerCase();
    const providerName = group.providerName.toLowerCase();
    const providerMatchesTerm = (term: string) => providerId.includes(term) || providerName.includes(term);

    if (terms.every(providerMatchesTerm)) {
      return [group];
    }

    // A term satisfies a model either by matching the provider (so it doesn't
    // narrow within this group) or by matching that model directly — every
    // space-separated term must be satisfied for the model to be kept.
    const matchingModels = group.models.filter((model) =>
      terms.every((term) => providerMatchesTerm(term) || modelMatchesTerm(model, term)),
    );

    return matchingModels.length > 0 ? [{ ...group, models: matchingModels }] : [];
  });
}
