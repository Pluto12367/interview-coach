# Prompt 体系设计文档

面试引擎的壁垒不在代码,在这套 prompt 的迭代。本文解释每个 prompt 的设计决策,便于后续调优(调优时只改 `src/lib/prompts/` 下的字符串,不动代码)。

## 总览

| Prompt | 文件 | 调用时机 | 模型 | 延迟容忍 |
|---|---|---|---|---|
| 面试官追问决策 | `interviewer.ts` | 每轮用户回答后 | deepseek-chat(必须低延迟) | 实时 |
| 出题计划生成 | `plan-generation.ts` | 建会话时一次 | deepseek-chat | 秒级 |
| 复盘报告 | `report.ts` | 面试结束后异步 | deepseek-reasoner | 分钟级 |
| JD 解析 | `jd-analysis.ts` | 提交 JD 后异步 | deepseek-reasoner | 分钟级 |
| 简历抽取 | `resume-extraction.ts` | 用户粘贴简历时 | deepseek-chat | 秒级 |
| 每日简报 | `daily-brief.ts` | 定时任务 | deepseek-chat | 无要求 |

成本策略:实时链路只用 chat 模型;reasoner 只用于离线任务,且建议排到空闲时段(价格减半)。

## 1. 面试官追问决策(心脏)

**职责**:每轮收到候选人回答,一次调用完成「分类 → 决策 → 生成台词」。

**分类三态**(决策的地基):
- `answered_ok` — 有细节/量化/完整逻辑 → 升级追问
- `answered_weak` — 空话、缺量化,但可救 → 要求具体化
- `stuck` — 答非所问/不知道/反复空洞 → 收尾换题

**行动决策表**(prompt 与代码双重执行):
| 情况 | 行动 |
|---|---|
| ok 且深度未满 | follow_up(量化→边界→方案对比→原理,逐层升级) |
| weak | follow_up(要例子、要数据) |
| stuck ×1 | follow_up(换角度验证) |
| stuck ×2(连续) | move_on |
| 深度达上限 | move_on |
| 最后一个环节且考察充分 | closing(反问环节) |

**双层决策设计**:约束同时注入 prompt("系统状态"段:已追问 x/3 次、已连续卡壳 N 次)和代码硬规则(越界强制覆盖)。模型 99% 的情况自己合规;代码覆盖只做兜底,且兜底台词是预设的自然短语。

**防幻觉**:铁律第一条——面试官只能基于「本环节依据」(素材摘录/JD 要求)和候选人当场陈述提问。这是"深挖你简历"体验的地基,也是与通用聊天 App 的本质区别。

**防 AI 腔**:一次一问、≤40 字口语短句、不复述、不教学、不元话语(示例对即示范了口吻)。

**两个副产物**:`weak_point`(弱点实时回流清单,飞轮齿轮)、`material_suggestion`(候选人当场说出的新细节,建议入库)。

**开场/转场不调用模型**:每个环节的开场问题由代码直接输出计划中的 `opening_question`(确定性、零延迟、省钱)。模型的职责聚焦在追问上。

## 2. 出题计划生成

**核心规则**:数量硬约束(技术面 1 intro + 2~3 project + 2~3 knowledge + 1 scenario;HR 面 1 intro + 4~5 behavioral + 1 自省 + 1 动机)、**锚定防幻觉**(project/behavioral 必须引用素材原文做 excerpt)、**弱点加权**(每个 open 弱点至少出现在一个环节中——这是"越用越准"的飞轮齿轮)、opening_question 具体化(禁止"介绍一下你的项目")。

代码层 `validatePlan` 兜底校验数量构成。

## 3. 复盘报告

**关键校准规则**:评分必须拉开差距(60=勉强,80=良好,90+罕见),禁止 75-85 的和稀泥分数;evidence 必须逐字引用原话;rewrite_example 只能用候选人自己的事实重写(防编造);输出直接驱动弱点清单与知识卡(报告即训练输入,不是展示品)。

## 4. JD 解析

三分要求(hard/plus/implicit)+ 逐条匹配矩阵(strong 要引用素材证据 / weak / missing 必须给可执行补救)+ 10~15 预测题(必须覆盖所有 hard 要求)。匹配矩阵是免费→付费转化的钩子。

## 5. 简历抽取

**宁缺毋滥 + 绝不编造**:result/metrics 没有的填空,禁止推测。用户确认后才入库(`verified=1`)——错误的素材会污染整个飞轮,确认环节不可省。

## 6. 每日简报

教练人格、≤150 字、deadline > practice > review 的优先级、每条 practice 必须是"最小可执行动作"。留存引擎,不是内容营销。

## 调优建议(W4 内测期)

1. 逐条听/读内测录音与 transcript,统计:模型误分类率、追问是否锚定、AI 腔出现频率。
2. 把典型坏例加进 few-shot 区(负例比正例有效)。
3. 一次只改一个变量,用同一份测试 transcript 对比报告输出。
4. 深度上限/卡壳阈值在 `engine/session-state.ts` 的 `MAX_DEPTH` 调整,不要靠 prompt 硬扛。
