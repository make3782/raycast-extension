import { Action, ActionPanel, Clipboard, Form, showToast, Toast } from "@raycast/api";
import { useMemo, useState } from "react";

type TimestampUnit = "seconds" | "milliseconds";

type DateTimeParseResult = {
  date: Date;
  hasMilliseconds: boolean;
};

type ConversionResult = {
  inputType: "timestamp" | "dateTime";
  title: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  detail: string;
};

const DATE_TIME_PATTERN = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,9}))?)?$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  const dateTime = [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
  ].join("");

  const milliseconds = date.getMilliseconds();
  return milliseconds > 0 ? `${dateTime}.${String(milliseconds).padStart(3, "0")}` : dateTime;
}

function getCurrentTimestamp(unit: TimestampUnit): string {
  const now = Date.now();
  return unit === "seconds" ? Math.floor(now / 1000).toString() : now.toString();
}

function resolveTimestampUnit(value: number): TimestampUnit {
  // 当前常见 Unix 秒级时间戳是 10 位，毫秒级时间戳是 13 位；用数量级自动兜底识别。
  return Math.abs(value) >= 1_000_000_000_000 ? "milliseconds" : "seconds";
}

function parseTimestamp(value: string): { date: Date; unit: TimestampUnit } | null {
  const trimmedValue = value.trim();

  if (!/^-?\d+$/.test(trimmedValue)) {
    return null;
  }

  const timestamp = Number(trimmedValue);
  if (!Number.isSafeInteger(timestamp)) {
    return null;
  }

  const unit = resolveTimestampUnit(timestamp);

  // Unix 时间戳通常以秒为单位，JavaScript Date 需要毫秒。
  const timeInMilliseconds = unit === "seconds" ? timestamp * 1000 : timestamp;
  const date = new Date(timeInMilliseconds);

  return Number.isNaN(date.getTime()) ? null : { date, unit };
}

function parseMilliseconds(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  // JavaScript Date 只支持毫秒；超过 3 位时按前三位毫秒处理。
  return Number(value.padEnd(3, "0").slice(0, 3));
}

function parseDateTime(value: string): DateTimeParseResult | null {
  const matchedValue = value.trim().match(DATE_TIME_PATTERN);
  if (!matchedValue) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "0", millisecond] = matchedValue;
  const parsedMillisecond = parseMilliseconds(millisecond);
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    parsedMillisecond,
  );

  // 反查各字段，避免 2026-02-31 这类输入被 Date 自动进位成 3 月。
  const isValidDate =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day) &&
    date.getHours() === Number(hour) &&
    date.getMinutes() === Number(minute) &&
    date.getSeconds() === Number(second) &&
    date.getMilliseconds() === parsedMillisecond;

  return isValidDate ? { date, hasMilliseconds: Boolean(millisecond) } : null;
}

function convertInput(value: string): ConversionResult | null {
  const timestampResult = parseTimestamp(value);
  if (timestampResult) {
    const { date, unit } = timestampResult;
    const secondsValue = Math.floor(date.getTime() / 1000).toString();
    const millisecondsValue = date.getTime().toString();

    return {
      inputType: "timestamp",
      title: "识别为 Unix 时间戳",
      primaryLabel: "时间",
      primaryValue: formatDate(date),
      secondaryLabel: unit === "seconds" ? "毫秒时间戳" : "秒级时间戳",
      secondaryValue: unit === "seconds" ? millisecondsValue : secondsValue,
      detail: `已自动按${unit === "seconds" ? "秒" : "毫秒"}解析`,
    };
  }

  const dateTimeResult = parseDateTime(value);
  if (dateTimeResult) {
    const { date, hasMilliseconds } = dateTimeResult;
    const secondsValue = Math.floor(date.getTime() / 1000).toString();
    const millisecondsValue = date.getTime().toString();

    return {
      inputType: "dateTime",
      title: "识别为日期时间",
      primaryLabel: hasMilliseconds ? "毫秒时间戳" : "秒级时间戳",
      primaryValue: hasMilliseconds ? millisecondsValue : secondsValue,
      secondaryLabel: hasMilliseconds ? "秒级时间戳" : "毫秒时间戳",
      secondaryValue: hasMilliseconds ? secondsValue : millisecondsValue,
      detail: "按本机时区解析",
    };
  }

  return null;
}

async function copyValue(value: string | null, successMessage: string) {
  if (!value) {
    await showToast({
      style: Toast.Style.Failure,
      title: "无法复制",
      message: "请先输入有效内容",
    });
    return;
  }

  await Clipboard.copy(value);
  await showToast({
    style: Toast.Style.Success,
    title: successMessage,
    message: value,
  });
}

export default function Command() {
  const [inputValue, setInputValue] = useState(formatDate(new Date()));
  const conversionResult = useMemo(() => convertInput(inputValue), [inputValue]);

  return (
    <Form
      navigationTitle="时间戳转换"
      actions={
        <ActionPanel>
          <ActionPanel.Section title="复制结果">
            <Action
              title="复制主要结果"
              onAction={() => copyValue(conversionResult?.primaryValue ?? null, "已复制主要结果")}
            />
            <Action
              title="复制备选结果"
              onAction={() => copyValue(conversionResult?.secondaryValue ?? null, "已复制备选结果")}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="填入当前时间">
            <Action title="填入当前时间" onAction={() => setInputValue(formatDate(new Date()))} />
            <Action title="填入当前秒级时间戳" onAction={() => setInputValue(getCurrentTimestamp("seconds"))} />
            <Action title="填入当前毫秒时间戳" onAction={() => setInputValue(getCurrentTimestamp("milliseconds"))} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.Description
        title="输入"
        text="支持 Unix 秒/毫秒时间戳，也支持 2026-06-18 16:38:19、2026-06-18 16:38:19.123 或 T 分隔格式。"
      />
      <Form.TextField
        id="inputValue"
        title="内容"
        placeholder="2026-06-18 16:38:19"
        value={inputValue}
        onChange={setInputValue}
      />
      <Form.Description
        title={conversionResult?.title ?? "等待识别"}
        text={conversionResult?.detail ?? "请输入有效时间戳或时间"}
      />
      <Form.Description
        title={conversionResult?.primaryLabel ?? "转换结果"}
        text={conversionResult?.primaryValue ?? "支持格式：Unix 时间戳、YYYY-MM-DD HH:mm:ss[.SSS]"}
      />
      <Form.Description
        title={conversionResult?.secondaryLabel ?? "备选结果"}
        text={conversionResult?.secondaryValue ?? "-"}
      />
    </Form>
  );
}
