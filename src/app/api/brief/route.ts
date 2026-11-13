import { getAI } from "@/lib/ai/client";
import { safeJsonParse } from "@/lib/ai/json";
import { buildDailyBriefPrompt } from "@/lib/prompts/daily-brief";
import { db, getLatestBrief, listApplications, listSessions, listWeakPoints, saveBrief } from "@/db";
import { bad, handle, ok } from "@/lib/http";
import type { BriefData } from "@/lib/types";

export async function GET() {
  return handle(async () => ok(getLatestBrief()));
}

/** 生成今日简报(生产环境由外部 cron 定时调用;此处也支持手动触发) */
export async function POST() {
  return handle(async () => {
    const date = new Date().toISOString().slice(0, 10);
    const apps = listApplications();
    const weakPoints = listWeakPoints();

    // 最近一次已完成面试的总评
    const doneSessions = listSessions().filter((s) => s.status === "done");
    let lastReportSummary: string | null = null;
    for (const s of doneSessions) {
      const r = getReportSummary(s.id);
      if (r) {
        lastReportSummary = `${r.verdict}:${r.oneLine}`;
        break;
      }
    }

    const ai = getAI();
    const raw = await ai.chatJSON(
      "brief",
      buildDailyBriefPrompt({ date, applications: apps, weakPoints, lastReportSummary }),
      [{ role: "user", content: "请按规则输出简报 JSON。" }],
      { mockCtx: { date } }
    );
    const data = safeJsonParse<BriefData>(raw);
    if (!Array.isArray(data.items)) return bad("简报格式异常");
    saveBrief(date, data);
    return ok({ date, data });
  });
}

function getReportSummary(sessionId: number): { verdict: string; oneLine: string } | null {
  const r = db.prepare("SELECT content FROM reports WHERE session_id = ?").get(sessionId) as { content?: unknown } | undefined;
  if (!r) return null;
  try {
    const parsed = JSON.parse(String(r.content)) as { overall?: { verdict?: string; oneLine?: string } };
    return { verdict: parsed.overall?.verdict ?? "-", oneLine: parsed.overall?.oneLine ?? "(无总评)" };
  } catch {
    return null;
  }
}
