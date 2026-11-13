import { getAI } from "@/lib/ai/client";
import { safeJsonParse } from "@/lib/ai/json";
import { buildPlanPrompt, validatePlan } from "@/lib/prompts/plan-generation";
import { getJd, getMaterial, listMaterials, listWeakPoints } from "@/db";
import type { Material, PlanThread, SessionMode, SessionPlan, WeakPointRow } from "@/lib/types";

/** 根据素材/JD/弱点构建出题计划(AI 生成 + 代码校验兜底) */
export async function buildPlanForSession(args: {
  mode: SessionMode;
  jdId: number | null;
  materialIds: number[] | null; // null = 全部 verified 素材
}): Promise<SessionPlan> {
  const { mode, jdId, materialIds } = args;

  let materials: Material[];
  if (materialIds && materialIds.length > 0) {
    materials = materialIds.map((id) => getMaterial(id)).filter((m): m is Material => m !== null);
  } else {
    materials = listMaterials().filter((m) => m.verified === 1);
  }

  const weakPoints: WeakPointRow[] = listWeakPoints().filter((w) => w.status === "open");

  let jdText: string | null = null;
  if (jdId) {
    const jd = getJd(jdId);
    if (jd) {
      if (jd.analysis) {
        const a = jd.analysis;
        jdText = `${a.company}·${a.position}\n画像:${a.summary}\n要求:\n${a.requirements.map((r) => `- [${r.type}] ${r.text}`).join("\n")}`;
      } else {
        jdText = `${jd.company}·${jd.position}\n${jd.rawText.slice(0, 800)}`;
      }
    }
  }

  const ai = getAI();
  const raw = await ai.chatJSON("plan", buildPlanPrompt({ mode, materials, jdText, weakPoints }), [
    { role: "user", content: "请按规则生成出题计划 JSON。" },
  ], {
    mockCtx: { mode, materials, weakPoints, jdRawText: jdText },
  });

  const parsed = safeJsonParse<{ threads: unknown[] }>(raw);
  const check = validatePlan(parsed, mode);
  if (!check.ok) throw new Error(`出题计划不合规: ${check.error}`);

  const threads = (parsed.threads as PlanThread[]).slice(0, 9).map((t, i) => ({
    id: t.id || `t${i}`,
    type: t.type,
    title: t.title || `环节 ${i + 1}`,
    grounding: {
      source: t.grounding?.source ?? "generic",
      refId: t.grounding?.refId ?? null,
      excerpt: t.grounding?.excerpt || "(未提供)",
    },
    openingQuestion: t.openingQuestion || "介绍一下你在这方面的经历。",
    focusPoints: Array.isArray(t.focusPoints) ? t.focusPoints : [],
  })) as PlanThread[];

  // 兜底:确保第一环节是 intro
  if (threads[0]?.type !== "intro") {
    threads.unshift({
      id: "t-intro",
      type: "intro",
      title: "自我介绍",
      grounding: { source: "generic", refId: null, excerpt: "候选人自我介绍" },
      openingQuestion: "请先用两分钟介绍一下自己。",
      focusPoints: ["表达结构", "亮点提炼"],
    });
  }

  return { threads };
}

export function planSummary(plan: SessionPlan): string {
  return plan.threads
    .map((t, i) => `${i + 1}. [${t.type}] ${t.title} | 开场:${t.openingQuestion} | 依据:${t.grounding.excerpt.slice(0, 80)}`)
    .join("\n");
}
