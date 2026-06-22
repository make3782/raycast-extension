import { useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { fetchModels, toProviderGroups, type ModelWithProvider } from "./lib/models";
import { filterProviders } from "./lib/filter";
import { buildProviderModelId, formatPriceAccessory } from "./lib/format";
import { limitResults } from "./lib/limit";

// Each rendered item carries a full detail-metadata tree; Raycast's extension
// worker has a fixed memory budget, and a broad query (even a single letter)
// can still match thousands of models, so unfiltered results are capped here.
const MAX_RESULTS = 50;

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

  const isSearchEmpty = searchText.trim().length === 0;
  const { groups, truncated, shownCount, totalCount } = useMemo(() => {
    if (isSearchEmpty) {
      return { groups: [], truncated: false, shownCount: 0, totalCount: 0 };
    }
    return limitResults(filterProviders(data ?? [], searchText), MAX_RESULTS);
  }, [data, searchText, isSearchEmpty]);

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

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      filtering={false}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="搜索供应商或模型名称..."
    >
      {isSearchEmpty ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="输入供应商或模型名称开始搜索"
          description="例如 anthropic、claude、gpt-4 等"
        />
      ) : (
        groups.map((group) => (
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
        ))
      )}
      {truncated ? (
        <List.Item
          title={`还有 ${totalCount - shownCount} 个结果未显示`}
          subtitle="请输入更精确的关键词缩小范围"
          icon={Icon.Ellipsis}
        />
      ) : null}
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
            <List.Item.Detail.Metadata.Label title="Cache Read Cost" text={`$${model.cost.cache_read} / 1M tokens`} />
          ) : null}
          {model.cost?.cache_write !== undefined ? (
            <List.Item.Detail.Metadata.Label title="Cache Write Cost" text={`$${model.cost.cache_write} / 1M tokens`} />
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
          {model.knowledge ? <List.Item.Detail.Metadata.Label title="Knowledge Cutoff" text={model.knowledge} /> : null}
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
