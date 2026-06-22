import type { Model } from "./models";

export function formatPriceAccessory(cost?: Model["cost"]): string | undefined {
  if (!cost || (cost.input === undefined && cost.output === undefined)) {
    return undefined;
  }

  const inputStr = cost.input !== undefined ? `$${cost.input}` : "—";
  const outputStr = cost.output !== undefined ? `$${cost.output}` : "—";
  return `${inputStr} / ${outputStr} per 1M`;
}

export function buildProviderModelId(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

export function buildProviderLogoUrl(providerId: string): string {
  return `https://models.dev/logos/${providerId}.svg`;
}
