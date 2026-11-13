/** 简历文本 → 结构化素材抽取(用户确认后才入库,防污染飞轮) */
export function buildResumeExtractionPrompt(resumeText: string): string {
  return `你是简历结构化专家。把以下简历原文拆解为结构化素材,供"AI 模拟面试官深挖简历"使用。抽取质量决定后续面试质量,宁缺毋滥。

# 简历原文
${resumeText}

# 抽取规则(严格遵守)
1. 只提取简历中明确存在的信息;result / metrics 中没有的填 null / [],【绝对禁止编造或推测数据】。
2. 每段经历生成一个 material:
   - type:project(课程/个人项目)| internship(实习)| competition(竞赛)| skill(独立技能条目,仅当简历有技能清单时生成一条汇总)
   - title:简短可读(如"校园二手交易平台")
   - situation:背景一句话;task:负责什么;action:怎么做的(保留技术方案细节,这是面试官深挖的依据);result:结果一句话
   - metrics:所有数字(性能、规模、名次、用户量),没有则 []
   - keywords:技术栈与领域词(如 Java/Redis/高并发)
3. warnings:指出简历硬伤(全部经历无量化、STAR 缺 result、技术栈堆砌无应用场景等),最多 5 条,每条给一句改法;没有问题则 []。
4. self_intro:基于简历写 60 秒自我介绍草稿(≤200 字),突出与"求职工程师岗"相关的亮点;只允许使用简历中存在的事实。

# 输出(只输出 JSON)
{"self_intro":"...","materials":[{"type":"project","title":"...","situation":"...","task":"...","action":"...","result":"...","metrics":["..."],"keywords":["..."]}],"warnings":["..."]}`;
}
