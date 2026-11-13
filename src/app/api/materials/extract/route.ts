import { getAI } from "@/lib/ai/client";
import { safeJsonParse } from "@/lib/ai/json";
import { buildResumeExtractionPrompt } from "@/lib/prompts/resume-extraction";
import { bad, handle, ok, readJson } from "@/lib/http";

interface ExtractResult {
  selfIntro: string;
  materials: {
    type: "project" | "internship" | "competition" | "skill";
    title: string;
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
    metrics: string[];
    keywords: string[];
  }[];
  warnings: string[];
}

/** 简历文本 → 结构化素材预览(不入库;用户确认后走 /import) */
export async function POST(req: Request) {
  return handle(async () => {
    const { text } = await readJson<{ text: string }>(req);
    if (!text?.trim()) return bad("请提供简历文本");
    if (text.length > 20000) return bad("简历文本过长,请精简后重试(≤20000 字符)");

    const ai = getAI();
    const raw = await ai.chatJSON("extract", buildResumeExtractionPrompt(text), [
      { role: "user", content: "请按规则输出抽取结果 JSON。" },
    ], { mockCtx: { resumeText: text } });

    const data = safeJsonParse<ExtractResult>(raw);
    if (!Array.isArray(data.materials)) return bad("抽取结果异常,请重试");
    return ok(data);
  });
}
