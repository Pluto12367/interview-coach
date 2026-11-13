import { getAI } from "@/lib/ai/client";
import { safeJsonParse } from "@/lib/ai/json";
import { buildJdAnalysisPrompt } from "@/lib/prompts/jd-analysis";
import { listMaterials, setJdAnalysis } from "@/db";
import type { JDAnalysis, Material } from "@/lib/types";

/** JD 解析(异步任务):结构化 + 匹配矩阵 + 预测题 */
export async function analyzeJd(jdId: number, rawText: string): Promise<void> {
  try {
    const materials: Material[] = listMaterials().filter((m) => m.verified === 1);
    const digest = materials
      .map(
        (m) =>
          `- 《${m.title}》[${m.type}] 做法:${m.action ?? "-"} | 结果:${m.result ?? "-"} | 量化:${m.metrics.join("/") || "-"} | 关键词:${m.keywords.join("/") || "-"}`
      )
      .join("\n");

    const ai = getAI();
    const raw = await ai.chatJSON("jd", buildJdAnalysisPrompt({ jdRawText: rawText.slice(0, 4000), materialsDigest: digest }), [
      { role: "user", content: "请按规则输出分析 JSON。" },
    ], { reasoner: true, mockCtx: { jdRawText: rawText } });

    const data = safeJsonParse<JDAnalysis>(raw);
    if (!Array.isArray(data.requirements) || !Array.isArray(data.matchMatrix)) {
      throw new Error("JD 分析缺少必要字段");
    }
    setJdAnalysis(jdId, "ready", data, data.company, data.position);
  } catch (err) {
    console.error(`[jd] ${jdId} 分析失败:`, err);
    setJdAnalysis(jdId, "failed", null);
  }
}
