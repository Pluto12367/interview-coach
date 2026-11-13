import { getAI } from "@/lib/ai/client";
import { safeJsonParse } from "@/lib/ai/json";
import { buildReportPrompt } from "@/lib/prompts/report";
import { getSession, getJd, listMessages, markWeakPointsDrilled, saveReport, setSessionEnded, upsertWeakPoint } from "@/db";
import { planSummary } from "@/lib/engine/plan";
import type { ReportData, SessionRow } from "@/lib/types";

/** 复盘报告生成(异步任务):transcript → 4 维评分 + 弱点/知识卡 → 回流数据层 */
export async function generateReport(sessionId: number): Promise<void> {
  const session = getSession(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.status !== "reporting") throw new Error(`会话状态为 ${session.status},不能生成报告`);

  try {
    const messages = listMessages(sessionId);
    if (messages.length === 0) throw new Error("对话记录为空");

    // 按 plan 环节归组 transcript,报告引用原话时有结构可依
    const threads = session.plan.threads;
    const byThread = new Map<string, typeof messages>();
    for (const m of messages) {
      const key = m.threadId ?? "_other";
      if (!byThread.has(key)) byThread.set(key, []);
      byThread.get(key)!.push(m);
    }
    const sections: string[] = [];
    threads.forEach((t, i) => {
      const rows = byThread.get(t.id) ?? [];
      const lines = rows.map((m) => (m.role === "interviewer" ? `面试官: ${m.content}` : `候选人: ${m.content}`));
      sections.push(`### 环节 ${i + 1}: ${t.title} [${t.type}]\n${lines.join("\n") || "(未进行)"}`);
    });
    const other = byThread.get("_other") ?? [];
    if (other.length) {
      sections.push(`### 其他(反问/收尾)\n${other.map((m) => (m.role === "interviewer" ? `面试官: ${m.content}` : `候选人: ${m.content}`)).join("\n")}`);
    }
    const transcript = sections.join("\n\n");

    const jd = session.jdId ? getJd(session.jdId) : null;
    const jdSummary = jd?.analysis
      ? `${jd.analysis.company}·${jd.analysis.position}:${jd.analysis.summary}\n要求:${jd.analysis.requirements.map((r) => r.text).join(";")}`
      : jd
        ? `${jd.company}·${jd.position}:${jd.rawText.slice(0, 400)}`
        : null;

    const ai = getAI();
    const raw = await ai.chatJSON(
      "report",
      buildReportPrompt({ mode: session.mode, transcript, planSummary: planSummary(session.plan), jdSummary }),
      [{ role: "user", content: "请按规则输出报告 JSON。" }],
      { reasoner: true, mockCtx: { mode: session.mode } }
    );

    const data = sanitizeReport(safeJsonParse<ReportData>(raw));

    // 报告结果回流数据层:新弱点入库;计划中覆盖的弱点标记为已练
    for (const w of data.newWeakPoints) {
      upsertWeakPoint({ description: w.description, knowledgePoint: w.knowledgePoint, source: "report" });
    }
    const drilledRefIds = threads
      .filter((t) => t.grounding.source === "weak_point" && t.grounding.refId != null)
      .map((t) => t.grounding.refId as number);
    markWeakPointsDrilled(drilledRefIds);

    saveReport(sessionId, data);
    setSessionEnded(sessionId, "done");
  } catch (err) {
    // 生成失败:状态置回 done,报告接口会返回 failed,可手动重试
    console.error(`[report] session ${sessionId} 生成失败:`, err);
    setSessionEnded(sessionId, "done");
    throw err;
  }
}

function sanitizeReport(raw: ReportData): ReportData {
  const dims = Array.isArray(raw.dimensions) ? raw.dimensions : [];
  return {
    overall: {
      verdict: ["strong_pass", "pass", "borderline", "fail"].includes(raw.overall?.verdict) ? raw.overall.verdict : "borderline",
      oneLine: raw.overall?.oneLine ?? "(无总评)",
    },
    dimensions: dims.map((d) => ({
      key: d.key ?? "unknown",
      name: d.name ?? d.key ?? "维度",
      score: Math.max(0, Math.min(100, Math.round(Number(d.score) || 0))),
      evidence: d.evidence ?? "(无)",
      issue: d.issue ?? "(无)",
      rewriteExample: d.rewriteExample ?? "(无)",
    })),
    topPriorities: Array.isArray(raw.topPriorities) ? raw.topPriorities : [],
    newWeakPoints: Array.isArray(raw.newWeakPoints) ? raw.newWeakPoints.slice(0, 6) : [],
    starGaps: Array.isArray(raw.starGaps) ? raw.starGaps : [],
    knowledgeCards: Array.isArray(raw.knowledgeCards) ? raw.knowledgeCards.slice(0, 5) : [],
    materialSuggestions: Array.isArray(raw.materialSuggestions) ? raw.materialSuggestions : [],
  };
}
