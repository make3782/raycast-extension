export type Model = {
  id: string;
  name: string;
  family?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  open_weights?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
};

export type Provider = {
  id: string;
  name: string;
  doc?: string;
  models: Record<string, Model>;
};

export type ModelsApiResponse = Record<string, Provider>;

export async function fetchModels(): Promise<ModelsApiResponse> {
  const res = await fetch("https://models.dev/api.json");
  if (!res.ok) {
    throw new Error(`models.dev request failed: ${res.status}`);
  }
  return (await res.json()) as ModelsApiResponse;
}
