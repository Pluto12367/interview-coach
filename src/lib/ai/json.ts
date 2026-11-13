/**
 * 从 LLM 输出中稳健提取 JSON(容忍 ```json 围栏、前后杂文),
 * 并把 snake_case 键深度归一化为 camelCase——prompt 里 JSON schema 用 snake_case
 * 是刻意的(对 LLM 更稳),TS 侧统一 camelCase,解析层负责转换。
 */
export function safeJsonParse<T>(raw: string): T {
  let text = raw.trim();
  // 去掉 markdown 围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // 截取第一个 { 到最后一个 }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`LLM 输出不是合法 JSON: ${raw.slice(0, 200)}`);
  }
  const slice = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch (e) {
    throw new Error(`JSON 解析失败: ${(e as Error).message}; 原文片段: ${slice.slice(0, 200)}`);
  }
  return deepCamel(parsed) as T;
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function deepCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCamel);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamel(k)] = deepCamel(v);
    }
    return out;
  }
  return value;
}
