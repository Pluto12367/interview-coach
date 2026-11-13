import type { Material, SessionMode, WeakPointRow } from "@/lib/types";

export interface PlanPromptInput {
  mode: SessionMode;
  materials: Material[]; // 已 verified
  jdText: string | null; // JD 分析的 requirements + summary,或原始 JD
  weakPoints: WeakPointRow[]; // status=open 权重最高
}

/** 出题计划生成 prompt(开场一次性生成,存入 session,整场面试按计划推进) */
export function buildPlanPrompt(input: PlanPromptInput): string {
  const { mode, materials, jdText, weakPoints } = input;
  const isTech = mode === "tech";

  const materialLines = materials.length
    ? materials
        .map(
          (m) =>
            `- [id=${m.id}][${m.type}]《${m.title}》:情境=${m.situation ?? "-"};任务=${m.task ?? "-"};做法=${m.action ?? "-"};结果=${m.result ?? "-"};量化=${m.metrics.join("/") || "-"};关键词=${m.keywords.join("/") || "-"}`
        )
        .join("\n")
    : "(素材库为空:请基于通用校招考察点出题,grounding.source 一律用 generic,不得引用任何虚构经历)";

  const weakLines = weakPoints.filter((w) => w.status === "open").length
    ? weakPoints
        .filter((w) => w.status === "open")
        .map((w) => `- [id=${w.id}] ${w.description}(知识点:${w.knowledgePoint})`)
        .join("\n")
    : "(暂无开放弱点)";

  return `你是资深校招面试官。为候选人生成一场${isTech ? "技术面" : "HR 行为面"}的出题计划。计划决定整场面试的推进,必须精确遵守数量与锚定规则。

# 候选人信息
## 素材库(候选人确认过的真实经历)
${materialLines}

## 历史弱点清单(开放状态,出题时必须覆盖验证)
${weakLines}

## 目标 JD
${jdText ?? "(未指定 JD:按通用校招标准出题)"}

# 计划规则(严格遵守)
1. 数量与构成:
${isTech
  ? `   - 恰好 1 个 intro(自我介绍)+ 2~3 个 project(项目深挖)+ 2~3 个 knowledge(基础/原理)+ 1 个 scenario(场景设计)`
  : `   - 恰好 1 个 intro(自我介绍)+ 4~5 个 behavioral(行为面,基于 STAR 素材)+ 1 个 self_reflection(自省,如缺点/失败经历)+ 1 个 motivation(求职动机)`}
2. 锚定(防幻觉):
   - project / behavioral 环节必须锚定一条真实素材:opening_question 要提到素材中的具体内容(项目名、技术栈、数据),grounding.excerpt 摘录该素材最相关的原文片段(40~120字,含量化数据);grounding.refId 填素材 id。
   - knowledge 环节锚定优先级:JD 硬性要求 > 素材 keywords 中的核心技术栈 > 通用基础;grounding.excerpt 写该知识点在 JD/素材中的原文依据。
   - 禁止问素材库与 JD 中都不存在的内容。
3. 弱点覆盖:每个 status=open 的弱点,必须在至少一个环节的 grounding 或 focus_points 中体现(优先安排在对应素材/知识点的环节里验证)。
4. opening_question:口语化、一个问句、≤50 字,具体不空洞(问"你在 XX 里是怎么做 YY 的",不问"介绍一下你的项目")。
5. focus_points:每环节 2~4 条考察点(后续追问的方向),只写考察点,不写答案。
6. 环节顺序:intro 永远第一;project 之间按与 JD 相关度排序;scenario 放技术面倒数第二;HR 面把 self_reflection 放倒数第二、motivation 放最后。

# 输出(只输出 JSON)
{"threads":[{"id":"t1","type":"intro|project|knowledge|scenario|behavioral|self_reflection|motivation","title":"简短环节名","grounding":{"source":"material|jd|weak_point|generic","refId":数字或null,"excerpt":"锚定原文片段"},"opening_question":"...","focus_points":["...","..."]}]}`;
}

/** 计划合法性校验 + 数量裁剪(代码层兜底,防止模型超发/漏发) */
export function validatePlan(plan: { threads: unknown[] }, mode: SessionMode): { ok: boolean; error?: string } {
  if (!Array.isArray(plan.threads) || plan.threads.length === 0) {
    return { ok: false, error: "plan.threads 为空" };
  }
  if (mode === "tech") {
    const counts = countTypes(plan.threads);
    if (!counts.intro) return { ok: false, error: "缺少 intro 环节" };
    if (!counts.project) return { ok: false, error: "缺少 project 环节" };
    if (plan.threads.length > 9) return { ok: false, error: "环节数过多" };
  } else {
    const counts = countTypes(plan.threads);
    if (!counts.intro) return { ok: false, error: "缺少 intro 环节" };
    if (!counts.behavioral) return { ok: false, error: "缺少 behavioral 环节" };
    if (plan.threads.length > 10) return { ok: false, error: "环节数过多" };
  }
  return { ok: true };
}

function countTypes(threads: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of threads as { type?: string }[]) {
    const k = t?.type ?? "unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
