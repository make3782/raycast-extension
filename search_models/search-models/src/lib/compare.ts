import type { ModelWithProvider } from "./models";

/**
 * 对比结果的方向。
 * - a / b：该指标 A 或 B 更优
 * - equal：两者相等
 * - unknown：无法比较（缺失值、或非数值/布尔类指标只做展示）
 */
export type DiffSide = "a" | "b" | "equal" | "unknown";

/** 单行对比结果，对应表格中的一行。 */
export type CompareRow = {
  /** 所属分组，用于在 UI 里分段渲染。 */
  group: string;
  /** 行标签，例如 "Context Window"。 */
  label: string;
  /** 模型 A 的展示值。 */
  valueA: string;
  /** 模型 B 的展示值。 */
  valueB: string;
  /** 差异方向，用于高亮。 */
  diff: DiffSide;
};

/**
 * 统一的"缺失值展示"约定：undefined / null 一律显示 "—"，
 * 否则交给 formatter。多调用点共享同一套对齐规则。
 */
function dash<T>(value: T | undefined, formatter: (v: T) => string): string {
  return value === undefined || value === null ? "—" : formatter(value);
}

/** 数值类指标的方向比较；任一缺失则无法比较。higherBetter=true 表示值大者优。 */
function compareNumber(a: number | undefined, b: number | undefined, higherBetter: boolean): DiffSide {
  if (a === undefined || b === undefined) return "unknown";
  if (a === b) return "equal";
  // higherBetter: 值大者优；否则值小者优。
  const aWins = higherBetter ? a > b : a < b;
  return aWins ? "a" : "b";
}

/** 布尔类指标：true 优于 false；任一缺失则无法比较。 */
function compareBool(a: boolean | undefined, b: boolean | undefined): DiffSide {
  if (a === undefined || b === undefined) return "unknown";
  if (a === b) return "equal";
  return a ? "a" : "b";
}

/** 布尔值统一展示：缺失→ "—"，true→✅，false→❌。 */
function boolText(value: boolean | undefined): string {
  return value === undefined ? "—" : value ? "✅" : "❌";
}

type RowAcc = CompareRow[];

function pushBasic(acc: RowAcc, a: ModelWithProvider, b: ModelWithProvider): void {
  acc.push(
    {
      group: "基础信息",
      label: "供应商",
      valueA: `${a.providerName} (${a.providerId})`,
      valueB: `${b.providerName} (${b.providerId})`,
      diff: "unknown",
    },
    {
      group: "基础信息",
      label: "Model ID",
      valueA: a.id,
      valueB: b.id,
      diff: "unknown",
    },
    {
      group: "基础信息",
      label: "Family",
      valueA: dash(a.family, String),
      valueB: dash(b.family, String),
      diff: "unknown",
    },
  );
}

function pushLimits(acc: RowAcc, a: ModelWithProvider, b: ModelWithProvider): void {
  const ctxA = a.limit?.context;
  const ctxB = b.limit?.context;
  acc.push({
    group: "上下文限制",
    label: "Context Window",
    valueA: dash(ctxA, (v) => `${v.toLocaleString()} tokens`),
    valueB: dash(ctxB, (v) => `${v.toLocaleString()} tokens`),
    diff: compareNumber(ctxA, ctxB, true),
  });

  const outA = a.limit?.output;
  const outB = b.limit?.output;
  acc.push({
    group: "上下文限制",
    label: "Max Output",
    valueA: dash(outA, (v) => `${v.toLocaleString()} tokens`),
    valueB: dash(outB, (v) => `${v.toLocaleString()} tokens`),
    diff: compareNumber(outA, outB, true),
  });
}

function pushCosts(acc: RowAcc, a: ModelWithProvider, b: ModelWithProvider): void {
  const fields: Array<{ key: "input" | "output" | "cache_read" | "cache_write"; label: string }> = [
    { key: "input", label: "Input Cost" },
    { key: "output", label: "Output Cost" },
    { key: "cache_read", label: "Cache Read Cost" },
    { key: "cache_write", label: "Cache Write Cost" },
  ];
  for (const { key, label } of fields) {
    const va = a.cost?.[key];
    const vb = b.cost?.[key];
    acc.push({
      group: "价格",
      label,
      valueA: dash(va, (v) => `$${v} / 1M`),
      valueB: dash(vb, (v) => `$${v} / 1M`),
      // 价格越低越优。
      diff: compareNumber(va, vb, false),
    });
  }
}

function pushCapabilities(acc: RowAcc, a: ModelWithProvider, b: ModelWithProvider): void {
  const fields: Array<{ key: keyof ModelWithProvider; label: string }> = [
    { key: "reasoning", label: "Reasoning" },
    { key: "tool_call", label: "Tool Calling" },
    { key: "attachment", label: "Attachments" },
    { key: "structured_output", label: "Structured Output" },
    { key: "temperature", label: "Temperature" },
    { key: "open_weights", label: "Open Weights" },
  ];
  for (const { key, label } of fields) {
    const va = a[key] as boolean | undefined;
    const vb = b[key] as boolean | undefined;
    acc.push({
      group: "能力",
      label,
      valueA: boolText(va),
      valueB: boolText(vb),
      diff: compareBool(va, vb),
    });
  }
}

function pushModalities(acc: RowAcc, a: ModelWithProvider, b: ModelWithProvider): void {
  const inA = a.modalities?.input;
  const inB = b.modalities?.input;
  const outModsA = a.modalities?.output;
  const outModsB = b.modalities?.output;
  acc.push(
    {
      group: "模态",
      label: "Modalities In",
      valueA: inA && inA.length > 0 ? inA.join(", ") : "—",
      valueB: inB && inB.length > 0 ? inB.join(", ") : "—",
      diff: "unknown",
    },
    {
      group: "模态",
      label: "Modalities Out",
      valueA: outModsA && outModsA.length > 0 ? outModsA.join(", ") : "—",
      valueB: outModsB && outModsB.length > 0 ? outModsB.join(", ") : "—",
      diff: "unknown",
    },
  );
}

function pushMeta(acc: RowAcc, a: ModelWithProvider, b: ModelWithProvider): void {
  const fields: Array<{ key: keyof ModelWithProvider; label: string }> = [
    { key: "knowledge", label: "Knowledge Cutoff" },
    { key: "release_date", label: "Release Date" },
    { key: "last_updated", label: "Last Updated" },
  ];
  for (const { key, label } of fields) {
    const va = a[key] as string | undefined;
    const vb = b[key] as string | undefined;
    acc.push({
      group: "元数据",
      label,
      valueA: dash(va, String),
      valueB: dash(vb, String),
      diff: "unknown",
    });
  }
}

/**
 * 对比两个模型，产出按分组排序的对比行列表。
 * 纯函数：相同输入恒定输出，便于单测。
 */
export function compareModels(a: ModelWithProvider, b: ModelWithProvider): CompareRow[] {
  const acc: RowAcc = [];
  pushBasic(acc, a, b);
  pushLimits(acc, a, b);
  pushCosts(acc, a, b);
  pushCapabilities(acc, a, b);
  pushModalities(acc, a, b);
  pushMeta(acc, a, b);
  return acc;
}

/**
 * 把对比行渲染成 Markdown 表格，方便复制到文档/笔记。
 * 列：指标 | 模型 A | 模型 B。
 */
export function toMarkdownTable(rows: CompareRow[], nameA: string, nameB: string): string {
  const lines: string[] = [`| 指标 | ${nameA} | ${nameB} |`, "| --- | --- | --- |"];
  for (const row of rows) {
    // 竖线转义，避免破坏表格结构。
    const a = row.valueA.replace(/\|/g, "\\|");
    const b = row.valueB.replace(/\|/g, "\\|");
    lines.push(`| ${row.label} | ${a} | ${b} |`);
  }
  return lines.join("\n");
}

/**
 * 按 group 分段渲染 Markdown：每个分组一个独立小表格，各自带完整表头。
 * 解决 Raycast Detail 长表格滚动时表头不可见的问题——任何分组内都能就近看到列顺序。
 * 复制场景仍推荐 toMarkdownTable（单表更紧凑）。
 */
export function toMarkdownByGroup(rows: CompareRow[], nameA: string, nameB: string): string {
  const sections: string[] = [];
  let currentGroup = "";
  let buffer: CompareRow[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    // 每个分组自带表头，保证滚动到任意位置都能看到 A/B 列顺序。
    sections.push(`### ${currentGroup}\n\n${toMarkdownTable(buffer, nameA, nameB)}`);
    buffer = [];
  };

  for (const row of rows) {
    if (row.group !== currentGroup) {
      flush();
      currentGroup = row.group;
    }
    buffer.push(row);
  }
  flush();
  return sections.join("\n\n");
}

/** 统计胜负行数（忽略 unknown），用于在 UI 上给出整体胜负摘要。 */
export function summarizeDiff(rows: CompareRow[]): { a: number; b: number; equal: number } {
  return rows.reduce(
    (acc, row) => {
      if (row.diff === "a") acc.a += 1;
      else if (row.diff === "b") acc.b += 1;
      else if (row.diff === "equal") acc.equal += 1;
      return acc;
    },
    { a: 0, b: 0, equal: 0 },
  );
}
