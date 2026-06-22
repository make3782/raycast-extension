import { useCallback, useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Color, Detail, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { fetchModels, toProviderGroups, type ModelWithProvider, type ProviderGroup } from "./lib/models";
import { filterProviders } from "./lib/filter";
import { buildProviderLogoUrl, buildProviderModelId, formatPriceAccessory } from "./lib/format";
import { compareModels, toMarkdownByGroup } from "./lib/compare";

/**
 * 对比命令的三阶段流程：
 * 1) pickA — 选第一个模型
 * 2) pickB — 选第二个模型（自动排除 A）
 * 3) result — 显示对比结果
 */
type Phase = "pickA" | "pickB" | "result";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [phase, setPhase] = useState<Phase>("pickA");
  const [selectedA, setSelectedA] = useState<ModelWithProvider | null>(null);
  const [selectedB, setSelectedB] = useState<ModelWithProvider | null>(null);

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

  // 从最新 data 按 (providerId, modelId) 重解析已选模型；数据刷新后避免悬空引用。
  // 找不到（模型被下架等）时回退到 pickA，让用户重新选择。
  const resolveModel = useCallback(
    (target: ModelWithProvider | null): ModelWithProvider | null => {
      if (!target || !data) return target;
      for (const group of data) {
        if (group.providerId !== target.providerId) continue;
        return group.models.find((m) => m.id === target.id) ?? null;
      }
      return null;
    },
    [data],
  );

  // 选择阶段使用的过滤结果：与 search-models 共用过滤逻辑，B 阶段排除 A。
  const pickGroups = useMemo<ProviderGroup[]>(() => {
    const filtered = filterProviders(data ?? [], searchText);
    if (phase === "pickB" && selectedA) {
      return filtered
        .map((g) => ({
          ...g,
          models: g.models.filter((m) => !(m.providerId === selectedA.providerId && m.id === selectedA.id)),
        }))
        .filter((g) => g.models.length > 0);
    }
    return filtered;
  }, [data, searchText, phase, selectedA]);

  // —— 错误兜底 ——
  if (error && !data) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.WifiDisabled}
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

  // 从最新 data 重解析已选模型；模型被下架等情况下回退到选择阶段，避免悬空引用。
  const resolvedA = resolveModel(selectedA);
  const resolvedB = resolveModel(selectedB);

  // —— 阶段三：结果视图 ——
  if (phase === "result" && resolvedA && resolvedB) {
    return (
      <CompareResult
        a={resolvedA}
        b={resolvedB}
        onReset={() => {
          setSelectedA(null);
          setSelectedB(null);
          setPhase("pickA");
          setSearchText("");
        }}
        onRepickA={() => {
          setPhase("pickA");
          setSearchText("");
        }}
        onRepickB={() => {
          setPhase("pickB");
          setSearchText("");
        }}
      />
    );
  }

  // —— 阶段一/二：选择视图 ——
  const isSearchEmpty = searchText.trim().length === 0;
  const placeholder = phase === "pickA" ? "选择第一个模型进行对比..." : "选择第二个模型进行对比...";
  const bannerTitle = phase === "pickA" ? "对比 · 第 1 个模型" : "对比 · 第 2 个模型";

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={placeholder}
      navigationTitle={bannerTitle}
    >
      {phase === "pickB" && selectedA ? (
        <List.Section title="已选第一个">
          <List.Item
            icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
            title={selectedA.name}
            subtitle={`${selectedA.providerName} · ${selectedA.id}`}
            accessories={[{ icon: Icon.Shuffle, text: "点击下方选择第二个" }]}
          />
        </List.Section>
      ) : null}
      {isSearchEmpty ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={phase === "pickA" ? "输入关键词选择第一个模型" : "输入关键词选择第二个模型"}
          description="例如 anthropic、claude、gpt-4 等"
        />
      ) : (
        pickGroups.map((group) => (
          <List.Section key={group.providerId} title={group.providerName} subtitle={`${group.models.length} 个模型`}>
            {group.models.map((model) => (
              <List.Item
                key={`${group.providerId}/${model.id}`}
                icon={{
                  source: buildProviderLogoUrl(group.providerId),
                  fallback: Icon.ComputerChip,
                }}
                title={model.name}
                subtitle={model.id}
                accessories={formatPriceAccessory(model.cost) ? [{ text: formatPriceAccessory(model.cost) }] : []}
                actions={
                  <ActionPanel>
                    <Action
                      title={phase === "pickA" ? "选为第一个模型" : "选为第二个模型"}
                      icon={Icon.PlusCircle}
                      onAction={() => {
                        if (phase === "pickA") {
                          setSelectedA(model);
                          setPhase("pickB");
                          setSearchText("");
                        } else {
                          setSelectedB(model);
                          setPhase("result");
                        }
                      }}
                    />
                    <Action.CopyToClipboard
                      title="复制 Provider/Model"
                      content={buildProviderModelId(group.providerId, model.id)}
                    />
                    {phase === "pickB" && selectedA ? (
                      <Action
                        title="返回重选第一个"
                        icon={Icon.ArrowLeft}
                        shortcut={{ modifiers: ["cmd"], key: "\\" }}
                        onAction={() => {
                          setPhase("pickA");
                          setSearchText("");
                        }}
                      />
                    ) : null}
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ))
      )}
      {data?.length === 0 && !isLoading ? <List.EmptyView icon={Icon.Tray} title="暂无模型数据" /> : null}
    </List>
  );
}

// —— 对比结果视图 ——————————————————————————————————————

function CompareResult({
  a,
  b,
  onReset,
  onRepickA,
  onRepickB,
}: {
  a: ModelWithProvider;
  b: ModelWithProvider;
  onReset: () => void;
  onRepickA: () => void;
  onRepickB: () => void;
}) {
  const rows = useMemo(() => compareModels(a, b), [a, b]);
  const markdown = useMemo(() => toMarkdownByGroup(rows, a.name, b.name), [rows, a.name, b.name]);

  const fullMarkdown = `# ${a.name} vs ${b.name}\n\n${markdown}`;

  return (
    <Detail
      markdown={fullMarkdown}
      navigationTitle={`${a.name}  vs  ${b.name}`}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="复制对比表 (Markdown)" content={fullMarkdown} />
          <Action.CopyToClipboard
            title="复制第一个模型的 Provider/Model"
            content={buildProviderModelId(a.providerId, a.id)}
          />
          <Action.CopyToClipboard
            title="复制第二个模型的 Provider/Model"
            content={buildProviderModelId(b.providerId, b.id)}
          />
          <Action title="重选第一个模型" icon={Icon.ArrowLeft} onAction={onRepickA} />
          <Action title="重选第二个模型" icon={Icon.ArrowRight} onAction={onRepickB} />
          <Action
            title="重新开始对比"
            icon={Icon.RotateAntiClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={onReset}
          />
        </ActionPanel>
      }
    />
  );
}
