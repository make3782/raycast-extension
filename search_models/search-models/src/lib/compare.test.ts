import { describe, it, expect } from "vitest";
import { compareModels, summarizeDiff, toMarkdownByGroup, toMarkdownTable, type CompareRow } from "./compare";
import type { ModelWithProvider } from "./models";

// 构造两个可对比的模型样本：A 在 context/output/reasoning 上占优，
// B 在价格上占优，tool_call 相等，其它字段覆盖缺失值分支。
const MODEL_A: ModelWithProvider = {
  id: "claude-opus-4-5",
  name: "Claude Opus 4.5",
  providerId: "anthropic",
  providerName: "Anthropic",
  reasoning: true,
  tool_call: true,
  attachment: true,
  structured_output: true,
  temperature: true,
  open_weights: false,
  modalities: { input: ["text", "image"], output: ["text"] },
  limit: { context: 200000, output: 32000 },
  cost: { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
};

const MODEL_B: ModelWithProvider = {
  id: "gpt-4o",
  name: "GPT-4o",
  providerId: "openai",
  providerName: "OpenAI",
  reasoning: false,
  tool_call: true, // 与 A 相等
  // attachment / structured_output / temperature 缺失，覆盖 unknown 分支
  open_weights: undefined,
  modalities: { input: ["text", "image", "audio"], output: ["text"] },
  limit: { context: 128000, output: 16384 },
  cost: { input: 5, output: 15, cache_read: 2.5 }, // cache_write 缺失
};

function rowByLabel(rows: CompareRow[], label: string): CompareRow {
  const row = rows.find((r) => r.label === label);
  if (!row) throw new Error(`row "${label}" not found`);
  return row;
}

describe("compareModels", () => {
  const rows = compareModels(MODEL_A, MODEL_B);

  it("emits rows grouped in the expected order", () => {
    const groups = rows.map((r) => r.group);
    // 去重后应保持首次出现的顺序。
    const distinct = groups.filter((g, i) => groups.indexOf(g) === i);
    expect(distinct).toEqual(["基础信息", "上下文限制", "价格", "能力", "模态", "元数据"]);
  });

  it("renders basic info fields verbatim", () => {
    const supplier = rowByLabel(rows, "供应商");
    expect(supplier.valueA).toBe("Anthropic (anthropic)");
    expect(supplier.valueB).toBe("OpenAI (openai)");
    expect(supplier.diff).toBe("unknown");
  });

  it("prefers the larger context window and marks the winner", () => {
    const ctx = rowByLabel(rows, "Context Window");
    expect(ctx.valueA).toBe("200,000 tokens");
    expect(ctx.valueB).toBe("128,000 tokens");
    expect(ctx.diff).toBe("a"); // 200k > 128k, higher is better
  });

  it("prefers the larger max output", () => {
    expect(rowByLabel(rows, "Max Output").diff).toBe("a");
  });

  it("treats price as lower-is-better and marks the winner", () => {
    const input = rowByLabel(rows, "Input Cost");
    expect(input.valueA).toBe("$15 / 1M");
    expect(input.valueB).toBe("$5 / 1M");
    expect(input.diff).toBe("b"); // 5 < 15, B 更优
  });

  it("falls back to '—' and unknown diff when a numeric value is missing", () => {
    const cw = rowByLabel(rows, "Cache Write Cost");
    expect(cw.valueA).toBe("$18.75 / 1M");
    expect(cw.valueB).toBe("—");
    expect(cw.diff).toBe("unknown");
  });

  it("marks booleans as a-wins when A is true and B false", () => {
    const reasoning = rowByLabel(rows, "Reasoning");
    expect(reasoning.valueA).toBe("✅");
    expect(reasoning.valueB).toBe("❌");
    expect(reasoning.diff).toBe("a");
  });

  it("marks booleans as equal when both have the same value", () => {
    expect(rowByLabel(rows, "Tool Calling").diff).toBe("equal");
  });

  it("marks booleans as unknown when one side is missing", () => {
    const attach = rowByLabel(rows, "Attachments");
    expect(attach.valueA).toBe("✅");
    expect(attach.valueB).toBe("—");
    expect(attach.diff).toBe("unknown");
  });

  it("joins modality lists and leaves them as unknown diff", () => {
    const inMod = rowByLabel(rows, "Modalities In");
    expect(inMod.valueA).toBe("text, image");
    expect(inMod.valueB).toBe("text, image, audio");
    expect(inMod.diff).toBe("unknown");
  });

  it("renders meta fields with dash for missing values", () => {
    const knowledge = rowByLabel(rows, "Knowledge Cutoff");
    expect(knowledge.valueA).toBe("—");
    expect(knowledge.valueB).toBe("—");
    expect(knowledge.diff).toBe("unknown");
  });
});

describe("summarizeDiff", () => {
  it("counts a/b/equal while ignoring unknown rows", () => {
    const rows = compareModels(MODEL_A, MODEL_B);
    const summary = summarizeDiff(rows);
    // 已知胜负：context(a) output(a) input(b) output-cost(b) cache-read(b) reasoning(a) tool-call(equal)。
    // 这里只校验方向统计逻辑，不强约束总数随字段扩展漂移。
    expect(summary.a).toBeGreaterThan(0);
    expect(summary.b).toBeGreaterThan(0);
    expect(summary.equal).toBeGreaterThan(0);
    expect(summary.a + summary.b + summary.equal).toBeLessThanOrEqual(rows.length);
  });

  it("returns all-zero when every row is unknown", () => {
    const rows: CompareRow[] = [{ group: "g", label: "x", valueA: "—", valueB: "—", diff: "unknown" }];
    expect(summarizeDiff(rows)).toEqual({ a: 0, b: 0, equal: 0 });
  });
});

describe("toMarkdownTable", () => {
  it("renders a header plus one row per CompareRow, escaping pipes", () => {
    const rows: CompareRow[] = [{ group: "g", label: "供应商", valueA: "A|B", valueB: "C", diff: "unknown" }];
    const md = toMarkdownTable(rows, "Model A", "Model B");
    const lines = md.split("\n");
    expect(lines[0]).toBe("| 指标 | Model A | Model B |");
    expect(lines[1]).toBe("| --- | --- | --- |");
    expect(lines[2]).toBe("| 供应商 | A\\|B | C |");
  });

  it("includes every compare row", () => {
    const rows = compareModels(MODEL_A, MODEL_B);
    const md = toMarkdownTable(rows, MODEL_A.name, MODEL_B.name);
    // 表头2行 + 数据行数。
    expect(md.split("\n").length).toBe(rows.length + 2);
  });
});

describe("toMarkdownByGroup", () => {
  it("renders one section per group, each with its own header row", () => {
    const rows: CompareRow[] = [
      { group: "G1", label: "a", valueA: "1", valueB: "2", diff: "unknown" },
      { group: "G1", label: "b", valueA: "3", valueB: "4", diff: "unknown" },
      { group: "G2", label: "c", valueA: "5", valueB: "6", diff: "unknown" },
    ];
    const md = toMarkdownByGroup(rows, "A", "B");
    // 两个分组标题 + 各自的表头（指标|A|B + 分隔行）。
    expect(md).toContain("### G1");
    expect(md).toContain("### G2");
    // 每个分组都应该自带列头，确保滚动到任意分组都能看到 A/B 顺序。
    const headerCount = (md.match(/\| 指标 \| A \| B \|/g) ?? []).length;
    expect(headerCount).toBe(2);
  });

  it("renders a section and table header for every contiguous group in real output", () => {
    const rows = compareModels(MODEL_A, MODEL_B);
    const md = toMarkdownByGroup(rows, MODEL_A.name, MODEL_B.name);
    // 去重保序得到分组列表。
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r.group)) seen.push(r.group);
    // 每个分组都应有一个 ### 标题和一个独立表头。
    for (const g of seen) {
      expect(md).toContain(`### ${g}`);
    }
    const headerCount = (md.match(/\| 指标 \| Claude Opus 4.5 \| GPT-4o \|/g) ?? []).length;
    expect(headerCount).toBe(seen.length);
  });
});
