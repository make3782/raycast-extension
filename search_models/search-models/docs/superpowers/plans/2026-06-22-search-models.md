# search-models Raycast 扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Raycast 扩展，可搜索 models.dev 上的 AI 模型/供应商信息（用于智能体配置时核对准确拼写），并展示价格、上下文长度、多模态支持等基本信息。

**Architecture:** 数据层（`src/lib/`）负责拉取 `https://models.dev/api.json`、转换分组、过滤、格式化，均为纯函数，用 vitest 做单元测试。UI 层（`src/search-models.tsx`）用 Raycast 的 `List` + `useCachedPromise`（来自 `@raycast/utils`）做即时缓存展示 + 后台刷新，按供应商分组、详情面板展示完整字段。`model-diff.ts` 暂时只是占位命令。

**Tech Stack:** TypeScript, React (Raycast `view` 命令), `@raycast/api` / `@raycast/utils`, vitest（仅用于 `src/lib/` 下的纯函数单测；UI 命令通过 `ray develop` 手动验证，因为 Raycast 组件渲染不在本项目现有测试基础设施覆盖范围内，且这是设计文档中明确约定的验证方式）。

## Global Constraints

- 数据源固定为 `https://models.dev/api.json`，模型的 `id` 字段不含供应商前缀，`provider/model` 组合字符串需自行拼接为 `${providerId}/${modelId}`。
- 价格字段单位为美元 / 百万 token（已用 Claude Opus 4.5 真实定价核对过）。
- 详情面板中任何缺失字段必须直接跳过渲染，不能出现 `undefined`/`NaN`。
- `model-diff` 命令本次只做占位（`showHUD` 提示开发中），不实现对比逻辑。
- 不修改 `eslint.config.js`；测试文件里显式 `import { describe, it, expect } from "vitest"`，不依赖全局变量，避免触发 `no-undef`。

---

### Task 1: 测试基础设施 + 数据类型 + fetchModels()

**Files:**
- Modify: `package.json`（新增 `vitest` devDependency 和 `test`/`test:watch` scripts）
- Create: `vitest.config.ts`
- Create: `src/lib/models.ts`
- Test: `src/lib/models.test.ts`

**Interfaces:**
- Produces: `Model` 类型、`Provider` 类型、`ModelsApiResponse` 类型（`Record<string, Provider>`）、`async function fetchModels(): Promise<ModelsApiResponse>`

- [ ] **Step 1: 提交现有脚手架（baseline commit）**

当前 `search-models/` 目录下的文件（`package.json`、`README.md`、`CHANGELOG.md`、`tsconfig.json`、`eslint.config.js`、`.prettierrc`、`.gitignore`、`assets/`、空的 `src/search-models.ts` 和 `src/model-diff.ts`）还没有被 git 跟踪过。先单独提交一次作为干净的起点，后续任务的 diff 才能看清楚改动了什么。

```bash
cd /Users/wzx/develop/raycast/search_models/search-models
git add package.json README.md CHANGELOG.md tsconfig.json eslint.config.js .prettierrc .gitignore assets src
git commit -m "chore(search-models): commit existing extension scaffold"
```

- [ ] **Step 2: 安装 vitest**

```bash
npm install -D vitest
```

Expected: `package.json` 的 `devDependencies` 里出现 `"vitest": "^x.y.z"`（具体版本由 npm 解析，照实保留即可）。

- [ ] **Step 3: 添加测试脚本**

在 `package.json` 的 `"scripts"` 对象里添加（保留原有的 `build`/`dev`/`fix-lint`/`lint`/`prepublishOnly`/`publish`）：

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: 创建 vitest 配置**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: 写失败的测试**

`src/lib/models.test.ts`:

```ts
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
```

- [ ] **Step 6: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— 报错 `Cannot find module './models'`（因为 `src/lib/models.ts` 还不存在）。

- [ ] **Step 7: 实现 `src/lib/models.ts`**

```ts
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
```

- [ ] **Step 8: 运行测试，确认通过**

Run: `npm test`
Expected: PASS（2 passed）

- [ ] **Step 9: 提交**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/models.ts src/lib/models.test.ts
git commit -m "feat(search-models): add models.dev data types and fetchModels"
```

> `package-lock.json` 是 Step 2 跑 `npm install -D vitest` 时生成/更新的；如果项目此前用的是别的包管理器锁文件（比如 `pnpm-lock.yaml`），把命令里的文件名换成实际生成的那个。

---

### Task 2: 转换为按供应商分组的展示结构（`toProviderGroups`）

**Files:**
- Modify: `src/lib/models.ts`
- Test: `src/lib/models.test.ts`

**Interfaces:**
- Consumes: `Model`、`Provider`、`ModelsApiResponse`（Task 1）
- Produces: `ModelWithProvider`（`Model & { providerId: string; providerName: string; providerDoc?: string }`）、`ProviderGroup`（`{ providerId: string; providerName: string; models: ModelWithProvider[] }`）、`function toProviderGroups(data: ModelsApiResponse): ProviderGroup[]`（按供应商 `name` 字母序排序，组内按模型 `name` 字母序排序）

- [ ] **Step 1: 写失败的测试**

在 `src/lib/models.test.ts` 末尾追加：

```ts
import { toProviderGroups } from "./models";

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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— `toProviderGroups is not a function` 之类的错误。

- [ ] **Step 3: 实现 `toProviderGroups`**

在 `src/lib/models.ts` 末尾追加：

```ts
export type ModelWithProvider = Model & {
  providerId: string;
  providerName: string;
  providerDoc?: string;
};

export type ProviderGroup = {
  providerId: string;
  providerName: string;
  models: ModelWithProvider[];
};

export function toProviderGroups(data: ModelsApiResponse): ProviderGroup[] {
  return Object.values(data)
    .map((provider) => {
      const models: ModelWithProvider[] = Object.values(provider.models)
        .map((model) => ({
          ...model,
          providerId: provider.id,
          providerName: provider.name,
          providerDoc: provider.doc,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        providerId: provider.id,
        providerName: provider.name,
        models,
      };
    })
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS（3 passed —— `npm test` 会跑整个项目的测试文件，此时只有 `models.test.ts`，共 3 个 it）

- [ ] **Step 5: 提交**

```bash
git add src/lib/models.ts src/lib/models.test.ts
git commit -m "feat(search-models): add toProviderGroups data transform"
```

---

### Task 3: 过滤逻辑（`filterProviders`）

**Files:**
- Create: `src/lib/filter.ts`
- Test: `src/lib/filter.test.ts`

**Interfaces:**
- Consumes: `ProviderGroup`、`ModelWithProvider`（Task 2，从 `./models` 导入）
- Produces: `function filterProviders(groups: ProviderGroup[], searchText: string): ProviderGroup[]`

- [ ] **Step 1: 写失败的测试**

`src/lib/filter.test.ts`:

```ts
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
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— 找不到 `./filter` 模块。

- [ ] **Step 3: 实现 `filterProviders`**

`src/lib/filter.ts`:

```ts
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS（8 passed —— `models.test.ts` 的 3 个 + `filter.test.ts` 的 5 个）

- [ ] **Step 5: 提交**

```bash
git add src/lib/filter.ts src/lib/filter.test.ts
git commit -m "feat(search-models): add filterProviders search logic"
```

---

### Task 4: 格式化辅助函数（价格 accessory、provider/model id）

**Files:**
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `Model["cost"]` 类型（Task 1，从 `./models` 导入）
- Produces: `function formatPriceAccessory(cost?: Model["cost"]): string | undefined`、`function buildProviderModelId(providerId: string, modelId: string): string`

- [ ] **Step 1: 写失败的测试**

`src/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatPriceAccessory, buildProviderModelId } from "./format";

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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— 找不到 `./format` 模块。

- [ ] **Step 3: 实现 `src/lib/format.ts`**

```ts
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS（12 passed —— `models.test.ts` 3 个 + `filter.test.ts` 5 个 + `format.test.ts` 4 个）

- [ ] **Step 5: 提交**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(search-models): add price accessory and provider/model id formatters"
```

---

### Task 5: `search-models` 主命令 UI

**Files:**
- Delete: `src/search-models.ts`（空文件，被下面的 `.tsx` 取代）
- Create: `src/search-models.tsx`

**Interfaces:**
- Consumes: `fetchModels`、`toProviderGroups`、`ModelWithProvider`（Task 1/2）；`filterProviders`（Task 3）；`formatPriceAccessory`、`buildProviderModelId`（Task 4）

这一层依赖 `@raycast/api` 的 `List`/`ActionPanel` 组件，只能在 Raycast 运行时渲染，无法用 vitest 做有意义的单测（mock 整个 Raycast UI 渲染树的成本和价值不成正比）。按照设计文档约定，这里用 `ray develop` 手动验证，不写自动化测试。

- [ ] **Step 1: 删除空的占位文件**

```bash
cd /Users/wzx/develop/raycast/search_models/search-models
rm src/search-models.ts
```

- [ ] **Step 2: 实现 `src/search-models.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { fetchModels, toProviderGroups, type ModelWithProvider } from "./lib/models";
import { filterProviders } from "./lib/filter";
import { buildProviderModelId, formatPriceAccessory } from "./lib/format";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const { data, isLoading, error, revalidate } = useCachedPromise(
    async () => toProviderGroups(await fetchModels()),
    [],
    { keepPreviousData: true },
  );

  useEffect(() => {
    if (error && data) {
      showToast({
        style: Toast.Style.Failure,
        title: "刷新失败",
        message: "正在显示上次缓存的数据",
      });
    }
  }, [error, data]);

  const groups = useMemo(() => filterProviders(data ?? [], searchText), [data, searchText]);

  if (error && !data) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.WifiOff}
          title="无法获取模型数据"
          description="请检查网络连接后重试"
          actions={
            <ActionPanel>
              <Action title="重试" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      filtering={false}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="搜索供应商或模型名称..."
    >
      {groups.map((group) => (
        <List.Section key={group.providerId} title={group.providerName}>
          {group.models.map((model) => {
            const priceAccessory = formatPriceAccessory(model.cost);
            return (
              <List.Item
                key={`${group.providerId}/${model.id}`}
                title={model.name}
                subtitle={model.id}
                accessories={priceAccessory ? [{ text: priceAccessory }] : []}
                detail={<ModelDetail model={model} />}
                actions={
                  <ActionPanel>
                    <Action.CopyToClipboard
                      title="复制 Provider/Model"
                      content={buildProviderModelId(group.providerId, model.id)}
                    />
                    <Action.CopyToClipboard title="复制 Model ID" content={model.id} />
                    <Action.CopyToClipboard title="复制 Provider ID" content={group.providerId} />
                    {model.providerDoc ? (
                      <Action.OpenInBrowser title="打开供应商文档" url={model.providerDoc} />
                    ) : null}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}

function ModelDetail({ model }: { model: ModelWithProvider }) {
  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="供应商" text={`${model.providerName} (${model.providerId})`} />
          <List.Item.Detail.Metadata.Label title="Model ID" text={model.id} />
          {model.family ? <List.Item.Detail.Metadata.Label title="Family" text={model.family} /> : null}
          <List.Item.Detail.Metadata.Separator />
          {model.limit?.context !== undefined ? (
            <List.Item.Detail.Metadata.Label
              title="Context Window"
              text={`${model.limit.context.toLocaleString()} tokens`}
            />
          ) : null}
          {model.limit?.output !== undefined ? (
            <List.Item.Detail.Metadata.Label
              title="Max Output"
              text={`${model.limit.output.toLocaleString()} tokens`}
            />
          ) : null}
          <List.Item.Detail.Metadata.Separator />
          {model.cost?.input !== undefined ? (
            <List.Item.Detail.Metadata.Label title="Input Cost" text={`$${model.cost.input} / 1M tokens`} />
          ) : null}
          {model.cost?.output !== undefined ? (
            <List.Item.Detail.Metadata.Label title="Output Cost" text={`$${model.cost.output} / 1M tokens`} />
          ) : null}
          {model.cost?.cache_read !== undefined ? (
            <List.Item.Detail.Metadata.Label
              title="Cache Read Cost"
              text={`$${model.cost.cache_read} / 1M tokens`}
            />
          ) : null}
          {model.cost?.cache_write !== undefined ? (
            <List.Item.Detail.Metadata.Label
              title="Cache Write Cost"
              text={`$${model.cost.cache_write} / 1M tokens`}
            />
          ) : null}
          <List.Item.Detail.Metadata.Separator />
          {model.modalities?.input?.length ? (
            <List.Item.Detail.Metadata.TagList title="Modalities In">
              {model.modalities.input.map((modality) => (
                <List.Item.Detail.Metadata.TagList.Item key={modality} text={modality} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          {model.modalities?.output?.length ? (
            <List.Item.Detail.Metadata.TagList title="Modalities Out">
              {model.modalities.output.map((modality) => (
                <List.Item.Detail.Metadata.TagList.Item key={modality} text={modality} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Reasoning" text={model.reasoning ? "✅" : "❌"} />
          <List.Item.Detail.Metadata.Label title="Tool Calling" text={model.tool_call ? "✅" : "❌"} />
          <List.Item.Detail.Metadata.Label title="Attachments" text={model.attachment ? "✅" : "❌"} />
          <List.Item.Detail.Metadata.Label title="Structured Output" text={model.structured_output ? "✅" : "❌"} />
          <List.Item.Detail.Metadata.Label title="Temperature" text={model.temperature ? "✅" : "❌"} />
          <List.Item.Detail.Metadata.Label title="Open Weights" text={model.open_weights ? "Yes" : "No"} />
          <List.Item.Detail.Metadata.Separator />
          {model.knowledge ? (
            <List.Item.Detail.Metadata.Label title="Knowledge Cutoff" text={model.knowledge} />
          ) : null}
          {model.release_date ? (
            <List.Item.Detail.Metadata.Label title="Release Date" text={model.release_date} />
          ) : null}
          {model.last_updated ? (
            <List.Item.Detail.Metadata.Label title="Last Updated" text={model.last_updated} />
          ) : null}
          {model.providerDoc ? (
            <>
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="Provider Docs" target={model.providerDoc} text="打开文档" />
            </>
          ) : null}
        </List.Item.Detail.Metadata>
      }
    />
  );
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错输出。

- [ ] **Step 4: 手动验证（`ray develop`）**

Run: `npm run dev`，在 Raycast 里打开 "search models" 扩展中的 "search_models" 命令，逐项验证：

1. 命令打开后，列表按供应商分组展示模型，每行右侧能看到价格标签（如 `$5 / $25 per 1M`）；无价格的模型不显示该标签。
2. 输入供应商名（如 "anthropic"）——该供应商分组下所有模型都显示，其他供应商分组消失。
3. 输入模型名/id 片段（如 "opus"）——跨供应商正确过滤，只剩下匹配的模型。
4. 选中任意模型，右侧详情面板字段完整：供应商、Model ID、Context Window、价格、Modalities、能力 ✅/❌、Open Weights、Knowledge Cutoff 等，没有 `undefined`/`NaN`；缺字段的模型对应行直接不显示。
5. 按 Enter，确认剪贴板内容是 `provider/model` 格式（如 `anthropic/claude-opus-4-5`）；用 `Cmd+C` 对应的其它 action 验证只复制 model id / provider id。
6. 有 `doc` 字段的供应商，确认能看到"打开供应商文档" action 并能正常跳转；没有 `doc` 的供应商，确认该 action 不显示。
7. 断开网络后重新打开命令，确认仍然展示上次缓存的列表，并出现"刷新失败"的失败态 Toast。

- [ ] **Step 5: 提交**

`src/search-models.ts` 是用 `rm` 直接从磁盘删除的（不是 `git rm`），所以用 `git add` 把这个删除和新文件一起加入 staging：

```bash
git add src/search-models.tsx src/search-models.ts
git commit -m "feat(search-models): implement search-models list command"
```

---

### Task 6: `model-diff` 占位命令

**Files:**
- Modify: `src/model-diff.ts`（当前是空文件）

**Interfaces:**
- 无（不依赖前面任务的任何导出）

- [ ] **Step 1: 实现占位命令**

`src/model-diff.ts`:

```ts
import { showHUD } from "@raycast/api";

export default async function Command() {
  await showHUD("功能开发中 — 敬请期待");
}
```

- [ ] **Step 2: 手动验证**

Run: `npm run dev`，在 Raycast 里触发 "model_diff" 命令，确认弹出 HUD 提示"功能开发中 — 敬请期待"，且不报错。

- [ ] **Step 3: 提交**

```bash
git add src/model-diff.ts
git commit -m "feat(search-models): add model-diff placeholder command"
```

---

### Task 7: 整体验证收尾

**Files:** 无新文件（仅运行检查，如发现问题则修复对应文件后再提交）

- [ ] **Step 1: 运行完整单测**

Run: `npm test`
Expected: 全部 PASS（Task 1-4 的所有测试，共 12 个 test case）。

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无报错。如有报错，运行 `npm run fix-lint` 自动修复，再人工检查剩余问题并修复。

- [ ] **Step 3: 复查 Task 5 的手动验证清单**

按 Task 5 Step 4 的 7 项逐一重新确认（尤其是断网场景和 Enter 复制内容），确保没有遗漏。

- [ ] **Step 4: 若有修复，提交**

```bash
git add -A
git commit -m "fix(search-models): address lint/manual verification findings"
```

（若 Step 2-3 都没有发现问题，跳过本步骤，无需空提交。）
