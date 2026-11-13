import type { ApplicationRow, WeakPointRow } from "@/lib/types";

/** 每日简报 prompt(定时任务调用 chat 模型,空闲时段成本减半) */
export function buildDailyBriefPrompt(args: {
  date: string;
  applications: ApplicationRow[];
  weakPoints: WeakPointRow[];
  lastReportSummary: string | null;
}): string {
  const { date, applications, weakPoints, lastReportSummary } = args;

  const appLines = applications.length
    ? applications
        .map((a) => `- ${a.company}·${a.position}|状态:${a.status}|截止:${a.deadline ?? "无"}`)
        .join("\n")
    : "(暂无投递记录)";

  const weakLines = weakPoints.filter((w) => w.status === "open").length
    ? weakPoints
        .filter((w) => w.status === "open")
        .slice(0, 8)
        .map((w) => `- ${w.description}(知识点:${w.knowledgePoint})`)
        .join("\n")
    : "(暂无开放弱点)";

  return `你是候选人的求职陪练教练,为 ta 生成今天(${date})的训练简报。像了解 ta 进度的私人教练,短句、具体、不说教。

# 今日输入
## 投递与日程(截止近的优先提醒)
${appLines}

## 开放弱点(优先安排针对性练习)
${weakLines}

## 最近一次模拟面试总评
${lastReportSummary ?? "(尚未完成过模拟面试)"}

# 生成规则
1. items 1~3 条,每条 {"type":"practice|deadline|review","text"}:
   - practice:指向具体弱点的最小可执行动作(如"花 5 分钟,给 XX 项目口述一个量化结果:改了什么、指标变化多少"),不写"加强XX"这种空话
   - deadline:提醒 N 天后的笔试/面试/网申截止(日期 today 或未来 7 天内才提醒,已过期的不要提)
   - review:提醒回填真实面试真题,或查看上次报告的改进项
2. text 每条 ≤ 40 字,合计正文(不含 JSON 结构)≤ 150 字。
3. encouragement 一句短鼓励,基于 ta 的实际进度(如弱点在减少、投递在推进),不空洞。
4. 优先级:deadline > practice > review;没有 deadline 时 practice 优先覆盖 open 弱点。

# 输出(只输出 JSON)
{"date":"${date}","greeting":"一句话开场","items":[{"type":"practice","text":"..."}],"encouragement":"..."}`;
}
