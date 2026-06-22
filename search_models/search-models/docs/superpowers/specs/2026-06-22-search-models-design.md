# search-models Raycast 扩展设计

## 背景与目标

配置智能体时经常需要填写"供应商/模型名"这类字段，但记不清准确拼写（例如到底是 `claude-opus-4-5` 还是 `claude-opus-4.5`）。本扩展通过 [models.dev](https://github.com/anomalyco/models.dev) 提供的公开数据（`https://models.dev/api.json`）实现一个可搜索的模型/供应商信息查询工具，核心需求：

1. 搜索供应商/模型名，得到准确拼写，方便填入智能体配置。
2. 查看模型基本信息：价格、上下文长度、多模态支持情况等。

## 数据源

`https://models.dev/api.json`：

- 顶层按供应商 id 分组（如 `"anthropic"`, `"openai"`, `"xai"`），共 144 个供应商。
- 每个供应商对象包含 `id`、`name`、`doc`（文档链接，可能缺失）、`models`（按模型 id 分组的对象）。
- 每个模型对象的 `id` 字段是裸的模型 slug（如 `"claude-opus-4-5"`），**不包含**供应商前缀；智能体配置常用的 `provider/model` 组合形式（如 `anthropic/claude-opus-4-5`）需要自己拼接，数据里没有现成字段。
- 模型字段：`name`、`family`、能力布尔值（`reasoning`/`tool_call`/`attachment`/`structured_output`/`temperature`）、`knowledge`（知识截止日期）、`release_date`、`last_updated`、`open_weights`、`modalities.{input,output}`（字符串数组）、`limit.{context,output}`（token 数）、`cost.{input,output,cache_read,cache_write}`（美元/百万 token，部分模型可能缺失）。
- 实测数据量：约 2.3MB，5289 个模型，全量请求耗时约 2.4 秒。

## 整体架构

```
search-models/
  src/
    lib/
      models.ts        — 类型定义 + fetchModels()
    search-models.tsx   — 主命令（List UI，view 模式）
    model-diff.ts        — 占位命令（no-view，未实现）
```

## 数据层

使用 `@raycast/utils` 的 `useCachedPromise` 包装 `fetchModels()`：

- 命令启动时立即展示上次缓存的数据（无需手动管理 TTL），同时在后台静默重新请求最新数据，请求完成后自动更新列表。
- 首次启动需要等待一次完整请求（~2.4s）；之后每次打开都是即时展示 + 后台刷新。

类型定义（`src/lib/models.ts`）：

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
  if (!res.ok) throw new Error(`models.dev request failed: ${res.status}`);
  return (await res.json()) as ModelsApiResponse;
}
```

## `search-models` 命令（UI）

**列表结构**：按供应商分组（`List.Section`，标题为供应商名），`isShowingDetail={true}`，右侧详情面板随选中项实时刷新。

**过滤逻辑**：自定义过滤（不用 Raycast 内置的仅匹配标题的过滤），用 `useMemo` 在缓存数据基础上计算：

- 供应商本身的 id/name 命中搜索词 → 该供应商下所有模型都展示；
- 否则只展示该供应商下 id/name/family 命中搜索词的模型；
- 两类都不命中的供应商整组被过滤掉。

数据量约 5300 条，简单字符串 `includes()` 过滤性能无虞。

**列表行**：

- Title：模型 `name`
- Subtitle：模型 `id`
- Accessory：价格标签，如 `$5 / $25 per 1M`（input/output，按 `cost` 字段拼接）；`cost` 缺失时不展示该 accessory

**详情面板**（`List.Item.Detail.Metadata`，按分组用 `Separator` 隔开，缺失字段直接跳过不渲染）：

1. Provider（name + id）、Model ID、Family
2. Context window、Max output tokens
3. Input / Output / Cache-read / Cache-write cost（美元/百万 token）
4. Modalities in / out（Tag 形式）
5. 能力：Reasoning、Tool calling、Attachments、Structured output、Temperature（各自 ✅/❌）
6. Open weights：Yes/No
7. Knowledge cutoff、Release date、Last updated
8. Provider 文档链接（`doc` 字段存在时才展示）

**Actions**（`ActionPanel`）：

- **Enter（主操作）**：复制 `provider/model`（如 `anthropic/claude-opus-4-5`）到剪贴板 —— 这是核心诉求
- 复制 Model ID
- 复制 Provider ID
- 打开 Provider 文档（`doc` 字段存在时才显示）

## 错误处理与边界情况

- 请求失败但本地有缓存：照常展示缓存数据，顶部弹出警告 Toast 提示"数据可能不是最新"。
- 请求失败且无缓存（如首次启动即断网）：展示 `List.EmptyView`，提示检查网络，并提供"重试"action（调用 `revalidate()`）。
- 字段缺失（如部分开源/本地模型无 `cost`）：detail 面板对应 `Label` 直接跳过，不展示 `undefined`/`NaN`。
- `doc` 字段缺失：不展示"打开供应商文档"action。

## `model-diff` 占位命令

保留在 `package.json`（已有 `mode: "no-view"` 定义），`src/model-diff.ts` 仅实现：

```ts
export default async function Command() {
  await showHUD("功能开发中 — 敬请期待");
}
```

确保扩展可正常构建、命令可见、点击不报错，但不做实际对比逻辑。对比功能留作后续迭代。

## 验证计划

- `ray lint` 通过。
- `ray develop` 本地启动，手动验证：
  - 搜索词命中供应商名（如 "anthropic"）→ 该分组下模型全部显示
  - 搜索词命中模型名/id（如 "opus" 或 "o3"）→ 跨供应商正确过滤
  - 选中模型后 detail 面板字段齐全、无 undefined/NaN
  - 按 Enter 复制的内容确实是 `provider/model` 格式，粘贴验证
  - 断网后重新打开命令，确认仍能看到上次缓存的列表（而不是空白或报错）
