import type { SessionMode } from "@/lib/types";

export interface ReportPromptInput {
  mode: SessionMode;
  transcript: string; // 已格式化的完整对话记录(含环节标题)
  planSummary: string; // 出题计划的简要描述
  jdSummary: string | null;
}

/** 复盘报告生成 prompt(面试结束后一次性异步生成,用 reasoner) */
export function buildReportPrompt(input: ReportPromptInput): string {
  const { mode, transcript, planSummary, jdSummary } = input;
  const isTech = mode === "tech";

  return `你是校招面试评估专家。以下是候选人一场${isTech ? "技术面" : "HR 行为面"}的完整记录,请生成结构化复盘报告。报告将直接展示给候选人并驱动其后续训练,必须具体、可执行、证据充分。

# 出题计划(面试按此推进)
${planSummary}

# 目标 JD
${jdSummary ?? "(本场未指定 JD)"}

# 完整对话记录
${transcript}

# 报告规则(严格遵守)
1. evidence 必须逐字引用对话记录中候选人的原话(可截取片段,用「」包裹),禁止改写后充当引用;找不到证据就写"(本场无相关表述)"。
2. 评分校准,拉开差距,禁止和稀泥:60=勉强及格(能答但平淡无细节);80=良好(有细节有量化);90+=优秀(有深度有亮点,罕见)。若整场空洞,允许出现 40~55 分。
3. rewrite_example 用候选人自己的项目事实重写示范,禁止编造新事实;示范控制在 2 句内。
4. new_weak_points 提取 2~5 条可训练的弱点:必须具体可练习("三个项目均无结果数据,缺乏量化表达"),禁止泛泛("沟通能力欠佳");与 top_priorities 保持一致,不要矛盾。
5. star_gaps:指出素材 STAR 四要素中缺失的环节与补法(无则空数组)。
6. knowledge_cards 0~4 张:只收录对话中候选人答不上来或答错的知识点,Q 一句话,A 精炼(≤120 字)。
7. material_suggestions:候选人当场提到但计划依据中没有的项目细节,建议补充进素材库(无则空数组)。
8. 四个维度:
${isTech
  ? `   - tech_depth 技术深度:原理理解、边界意识、方案权衡
   - structure 结构表达:回答是否有情境-行动-结果的结构
   - quantification 量化与证据:数据、指标、具体结果的呈现
   - relevance 岗位匹配度:与 JD 要求的贴合程度${jdSummary ? "" : "(无 JD 时,评临场逻辑与应变,基于通用标准)"}`
  : `   - storytelling 故事完整度:STAR 结构是否完整、有细节
   - reflection 自省与成长:对失败/缺点的认知是否真实深刻
   - culture 文化与动机匹配:价值观、稳定性的信号
   - delivery 表达感染力:简洁度、自信度、逻辑连接词`}
9. overall.verdict 判定:strong_pass(明显通过)/ pass(可以通过)/ borderline(边缘,待定)/ fail(不通过),one_line 用面试官口吻一句话解释(≤40字)。

# 输出(只输出 JSON)
{"overall":{"verdict":"strong_pass|pass|borderline|fail","one_line":"..."},
"dimensions":[{"key":"tech_depth","name":"技术深度","score":72,"evidence":"「引用原话」或(本场无相关表述)","issue":"问题所在,一句话","rewrite_example":"改写示范"}],
"top_priorities":[{"description":"...","knowledge_point":"..."}],
"new_weak_points":[{"description":"...","knowledge_point":"..."}],
"star_gaps":["..."],
"knowledge_cards":[{"q":"...","a":"..."}],
"material_suggestions":["..."]}`;
}
