import type { ProviderGroup } from "./models";

export type LimitedResults = {
  groups: ProviderGroup[];
  totalCount: number;
  shownCount: number;
  truncated: boolean;
};

export function limitResults(groups: ProviderGroup[], maxModels: number): LimitedResults {
  const totalCount = groups.reduce((sum, group) => sum + group.models.length, 0);

  const limitedGroups: ProviderGroup[] = [];
  let shownCount = 0;

  for (const group of groups) {
    if (shownCount >= maxModels) break;

    const remaining = maxModels - shownCount;
    const models = group.models.slice(0, remaining);
    limitedGroups.push(models.length === group.models.length ? group : { ...group, models });
    shownCount += models.length;
  }

  return { groups: limitedGroups, totalCount, shownCount, truncated: shownCount < totalCount };
}
