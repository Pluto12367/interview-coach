/** JD 解析 prompt:结构化 + 匹配矩阵 + 预测题(异步任务,用 reasoner) */
export function buildJdAnalysisPrompt(args: { jdRawText: string; materialsDigest: string }): string {
  const { jdRawText, materialsDigest } = args;

  return `你是校招求职教练。分析以下 JD 原文,并与候选人素材库逐条比对,输出结构化分析。这份分析将决定后续模拟面试的出题方向,必须准确、可执行。

# JD 原文
${jdRawText}

# 候选人素材库(已确认的真实经历)
${materialsDigest || "(素材库为空:match_matrix 各行 verdict 一律 missing)"}

# 分析规则(严格遵守)
1. requirements 只来自 JD 原文,不得脑补;分类:
   - hard:硬性要求(技能、学历、经验)
   - plus:加分项
   - implicit:隐含要求(如"能承受压力"暗示加班强度、"快速迭代"暗示多项目并行,要给出解读)
2. match_matrix 逐条对照素材库:
   - strong:素材中有直接证据,evidence 引用素材原文片段
   - weak:沾边但证据不足(如要求"高并发"而素材只提到"订单系统"无量化)
   - missing:素材库完全缺失,suggestion 必须给可执行的补救动作(如"两周内给 XX 项目补一次压测报告:QPS/延迟/错误率三个数字")
3. predicted_questions 10~15 题:来源标注(JD 某条要求 / 素材《标题》),难度分布约 easy 30%、medium 50%、hard 20%;必须覆盖所有 hard 要求。
4. 不编造素材库中不存在的内容;不确定就标 weak/missing。

# 输出(只输出 JSON)
{"company":"...","position":"...","summary":"3 句话画像:这家公司这个岗位需要什么样的人",
"requirements":[{"text":"...","type":"hard|plus|implicit"}],
"match_matrix":[{"requirement":"...","verdict":"strong|weak|missing","evidence":"素材原文片段或空","suggestion":"改进口径或补救动作"}],
"predicted_questions":[{"text":"...","source":"...","difficulty":"easy|medium|hard"}]}`;
}
