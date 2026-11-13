import type { Material, PlanThread, SessionMode, WeakPointRow } from "@/lib/types";

/**
 * AI Provider 抽象。
 * - RealAI:DeepSeek chat/completions(OpenAI 兼容),reasoner 用于离线重任务。
 * - MockAI:全链路确定性假数据,无 Key 可离线跑通整个产品闭环(演示/测试用)。
 */

export type MockKind = "interviewer" | "plan" | "report" | "jd" | "extract" | "brief";
export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export interface MockCtx {
  materials?: Material[];
  weakPoints?: WeakPointRow[];
  mode?: SessionMode;
  jdRawText?: string | null;
  resumeText?: string;
  date?: string;
  // interviewer 专用
  threadType?: PlanThread["type"];
  threadTitle?: string;
  depth?: number;
  stuck?: number;
  phase?: "interview" | "closing";
  turnCount?: number;
  userText?: string;
  isLast?: boolean;
}

export interface ChatOpts {
  reasoner?: boolean;
  mockCtx?: MockCtx;
}

export interface AIProvider {
  readonly name: "real" | "mock";
  chatJSON(kind: MockKind, system: string, messages: LLMMessage[], opts?: ChatOpts): Promise<string>;
}

// ---------------- 真实 Provider ----------------

const TEMP: Record<MockKind, number> = {
  interviewer: 0.8,
  plan: 0.3,
  report: 0.3,
  jd: 0.2,
  extract: 0.2,
  brief: 0.7,
};
const MAX_TOKENS: Record<MockKind, number> = {
  interviewer: 400,
  plan: 3000,
  report: 3500,
  jd: 3500,
  extract: 2500,
  brief: 600,
};

class RealAI implements AIProvider {
  readonly name = "real" as const;

  async chatJSON(kind: MockKind, system: string, messages: LLMMessage[], opts?: ChatOpts): Promise<string> {
    const base = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    const model = opts?.reasoner
      ? process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner"
      : process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat";
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: system }, ...messages],
      temperature: TEMP[kind],
      max_tokens: MAX_TOKENS[kind],
    };
    // reasoner 不强制 json 模式,靠 safeJsonParse 兜底
    if (!opts?.reasoner) body.response_format = { type: "json_object" };

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 返回空 content");
    return content;
  }
}

// ---------------- Mock Provider ----------------

class MockAI implements AIProvider {
  readonly name = "mock" as const;

  async chatJSON(kind: MockKind, _system: string, messages: LLMMessage[], opts?: ChatOpts): Promise<string> {
    const ctx = opts?.mockCtx ?? {};
    switch (kind) {
      case "plan":
        return JSON.stringify(mockPlan(ctx));
      case "interviewer":
        return JSON.stringify(mockTurn(ctx));
      case "report":
        return JSON.stringify(mockReport(ctx));
      case "jd":
        return JSON.stringify(mockJd());
      case "extract":
        return JSON.stringify(mockExtract());
      case "brief":
        return JSON.stringify(mockBrief(ctx.date));
    }
  }
}

function mockPlan(ctx: MockCtx): { threads: PlanThread[] } {
  const mode = ctx.mode ?? "tech";
  const mats = (ctx.materials ?? []).filter((m) => m.type !== "skill");
  const threads: PlanThread[] = [
    {
      id: "t0",
      type: "intro",
      title: "自我介绍",
      grounding: { source: "generic", refId: null, excerpt: "候选人自我介绍,校准整体印象" },
      openingQuestion: "请先用两分钟介绍一下自己,重点讲你最拿得出手的一段经历。",
      focusPoints: ["表达结构", "亮点提炼", "与岗位的相关性"],
    },
  ];
  let i = 1;
  if (mode === "tech") {
    for (const m of mats.slice(0, 3)) {
      threads.push({
        id: `t${i++}`,
        type: "project",
        title: m.title,
        grounding: {
          source: "material",
          refId: m.id,
          excerpt: `做法:${m.action ?? "-"};结果:${m.result ?? "-"};量化:${m.metrics.join("/") || "-"}`,
        },
        openingQuestion: `你在《${m.title}》里具体负责哪一块?说说最难的那个问题是怎么解决的。`,
        focusPoints: ["方案合理性", "量化结果", "边界与取舍"],
      });
    }
    const kws = Array.from(new Set(mats.flatMap((m) => m.keywords))).slice(0, 2);
    const topics = kws.length ? kws : ["HTTP 缓存", "数据库索引"];
    for (const t of topics) {
      threads.push({
        id: `t${i++}`,
        type: "knowledge",
        title: `基础:${t}`,
        grounding: { source: "generic", refId: null, excerpt: `候选人在素材中使用了 ${t}` },
        openingQuestion: `说说 ${t} 的核心原理,以及你在项目里是怎么用它解决实际问题的?`,
        focusPoints: ["原理理解", "实践结合", "常见坑"],
      });
    }
    threads.push({
      id: `t${i++}`,
      type: "scenario",
      title: "场景设计",
      grounding: { source: "generic", refId: null, excerpt: "通用系统设计能力" },
      openingQuestion: "如果要你设计一个短链接服务,你会怎么设计?先说整体方案。",
      focusPoints: ["方案分层", "容量估算", "权衡取舍"],
    });
  } else {
    for (const m of mats.slice(0, 4)) {
      threads.push({
        id: `t${i++}`,
        type: "behavioral",
        title: `经历:${m.title}`,
        grounding: {
          source: "material",
          refId: m.id,
          excerpt: `情境:${m.situation ?? "-"};任务:${m.task ?? "-"};结果:${m.result ?? "-"}`,
        },
        openingQuestion: `讲讲《${m.title}》里你印象最深的一件事,当时的情况和你做的事。`,
        focusPoints: ["STAR 完整度", "个人贡献", "结果与反思"],
      });
    }
    threads.push({
      id: `t${i++}`,
      type: "self_reflection",
      title: "自省",
      grounding: { source: "generic", refId: null, excerpt: "对失败与不足的认知" },
      openingQuestion: "说说你最近一次搞砸的事情,后来你怎么处理的?",
      focusPoints: ["真实性", "归因方式", "改进行动"],
    });
    threads.push({
      id: `t${i++}`,
      type: "motivation",
      title: "求职动机",
      grounding: { source: "generic", refId: null, excerpt: "稳定性与匹配度信号" },
      openingQuestion: "为什么想来我们公司做这个岗位?",
      focusPoints: ["动机真实性", "对岗位的理解", "职业规划"],
    });
  }
  return { threads };
}

function mockTurn(ctx: MockCtx): Record<string, unknown> {
  const phase = ctx.phase ?? "interview";
  const depth = ctx.depth ?? 0;
  const userText = ctx.userText ?? "";

  if (phase === "closing") {
    if (/没有|没了|结束|没了谢谢/.test(userText)) {
      return {
        classification: "answered_ok",
        action: "end",
        say: "好的,今天的面试就到这里。感谢你的时间,后续结果 HR 会和你同步。",
        thread_done: true,
        weak_point: null,
        material_suggestion: null,
        anchor: null,
      };
    }
    return {
      classification: "answered_ok",
      action: "follow_up",
      say: "这个问题涉及流程细节,HR 后续会跟你同步。还有其他想问的吗?",
      thread_done: true,
      weak_point: null,
      material_suggestion: null,
      anchor: null,
    };
  }

  if (depth === 0) {
    return {
      classification: "answered_weak",
      action: "follow_up",
      say: `你说的「${firstWords(userText, 8)}」,具体是怎么做的?`,
      thread_done: false,
      weak_point: { description: "回答偏概括,缺少具体做法", knowledge_point: "细节展开" },
      material_suggestion: null,
      anchor: firstWords(userText, 8),
    };
  }
  if (depth === 1) {
    return {
      classification: "answered_ok",
      action: "follow_up",
      say: "这块有量化数据吗?比如提升了多少、规模多大?",
      thread_done: false,
      weak_point: { description: "缺乏量化表达", knowledge_point: "量化表达" },
      material_suggestion: `《${ctx.threadTitle ?? "项目"}》补充量化数据(演示)`,
      anchor: null,
    };
  }
  return {
    classification: "answered_ok",
    action: "move_on",
    say: "好,这个问题先到这里。",
    thread_done: true,
    weak_point: null,
    material_suggestion: null,
    anchor: null,
  };
}

function firstWords(s: string, n: number): string {
  return s.replace(/\s+/g, " ").slice(0, n);
}

function mockReport(_ctx: MockCtx): Record<string, unknown> {
  return {
    overall: { verdict: "borderline", one_line: "项目有真实内容,但量化表达和深度追问明显不足。(演示数据)" },
    dimensions: [
      {
        key: "tech_depth",
        name: "技术深度",
        score: 58,
        evidence: "(本场无相关表述)",
        issue: "追问边界场景时未能展开",
        rewrite_example: "把'加了缓存'改成'用本地缓存承接热点读,P99 从 800ms 降到 120ms,失效用 TTL+随机抖动兜底'。",
      },
      {
        key: "structure",
        name: "结构表达",
        score: 66,
        evidence: "(本场无相关表述)",
        issue: "回答缺少情境铺垫,直接跳到结论",
        rewrite_example: "先一句背景,再一句动作,最后一句结果。",
      },
      {
        key: "quantification",
        name: "量化与证据",
        score: 45,
        evidence: "(本场无相关表述)",
        issue: "整场没有出现一个可信数字",
        rewrite_example: "为每个项目准备 2 个数字:规模 + 收益。",
      },
      {
        key: "relevance",
        name: "岗位匹配度",
        score: 62,
        evidence: "(本场无相关表述)",
        issue: "经历与岗位要求的关联未点破",
        rewrite_example: "回答结尾主动把项目价值和 JD 要求连起来。",
      },
    ],
    top_priorities: [
      { description: "为每个项目准备一个量化结果口径", knowledge_point: "量化表达" },
      { description: "练习边界场景追问的应答(失效、扩容、降级)", knowledge_point: "系统边界" },
    ],
    new_weak_points: [
      { description: "缺乏量化表达:整场面试无一个可信数字", knowledge_point: "量化表达" },
      { description: "对缓存失效与雪崩场景未掌握", knowledge_point: "缓存高可用" },
    ],
    star_gaps: ["多数经历缺少 R(结果):建议补充'改动 → 指标变化'的因果句"],
    knowledge_cards: [
      { q: "缓存雪崩的常见应对?", a: "过期时间加随机抖动、多级缓存、熔断降级、热点永不过期+异步刷新。" },
    ],
    material_suggestions: ["面试中提到的量化数据(演示),请补充进对应素材"],
  };
}

function mockJd(): Record<string, unknown> {
  return {
    company: "示例科技(演示数据)",
    position: "后端开发工程师(校招)",
    summary: "重后端基础与工程落地的团队;看重高并发场景经验与系统性思维;对项目真实性追问较深。",
    requirements: [
      { text: "熟悉 Java/Go 至少一门后端语言", type: "hard" },
      { text: "有高并发系统设计与优化经验", type: "hard" },
      { text: "熟悉 MySQL、Redis 及常见缓存方案", type: "hard" },
      { text: "有良好的沟通与协作能力", type: "implicit" },
    ],
    match_matrix: [
      { requirement: "熟悉 Java/Go 至少一门后端语言", verdict: "strong", evidence: "《校园二手交易平台》:Java + Spring Boot", suggestion: "保持" },
      { requirement: "有高并发系统设计与优化经验", verdict: "weak", evidence: "提到订单系统但无并发量数据", suggestion: "给项目补一次压测:QPS/P99/错误率三个数字" },
      { requirement: "熟悉 MySQL、Redis 及常见缓存方案", verdict: "strong", evidence: "素材提到 Redis 本地缓存", suggestion: "准备缓存失效与一致性追问的答案" },
      { requirement: "有良好的沟通与协作能力", verdict: "missing", evidence: "", suggestion: "在 STAR 中补一句跨角色协作的事实" },
    ],
    predicted_questions: [
      { text: "你的订单系统峰值 QPS 多少?怎么测的?", source: "JD:高并发", difficulty: "medium" },
      { text: "Redis 和本地缓存的一致性怎么保证?", source: "JD:缓存", difficulty: "hard" },
      { text: "介绍一下你最有挑战的一个项目", source: "通用", difficulty: "easy" },
    ],
  };
}

function mockExtract(): Record<string, unknown> {
  return {
    self_intro:
      "面试官好,我是计算机专业应届生,做过校园二手交易平台(Java/Spring Boot + MySQL),主导了订单模块的性能优化,并参加过 XX 竞赛。熟悉后端开发与常见缓存方案,希望在工程实践中继续深入高并发方向。(演示数据)",
    materials: [
      {
        type: "project",
        title: "校园二手交易平台(演示)",
        situation: "校园内二手交易依赖群聊,信息分散、信任差",
        task: "独立设计并实现交易平台后端",
        action: "Spring Boot + MySQL 实现的商品/订单/消息模块,引入 Redis 缓存热点商品列表",
        result: "上线一个月注册用户 800+,日均订单 60 单",
        metrics: ["注册用户 800+", "日均订单 60 单"],
        keywords: ["Java", "Spring Boot", "MySQL", "Redis", "缓存"],
      },
      {
        type: "project",
        title: "订单模块性能优化(演示)",
        situation: "商品详情页高峰期响应慢",
        task: "优化接口延迟",
        action: "本地缓存 + Redis 两级缓存,慢 SQL 加索引改写",
        result: "接口 P99 延迟从 800ms 降到 120ms",
        metrics: ["P99 800ms→120ms"],
        keywords: ["缓存", "性能优化", "SQL 调优"],
      },
    ],
    warnings: ["(演示)两条经历均缺少可信量化来源,建议补充压测报告或运营数据截图", "(演示)技能清单建议合并为一条 skill 素材"],
  };
}

function mockBrief(date?: string): Record<string, unknown> {
  return {
    date: date ?? "今天",
    greeting: "早上好,看下今天的安排。",
    items: [
      { type: "practice", text: "花 5 分钟,给「订单性能优化」口述一个完整量化口径:改了什么、P99 变化多少。" },
      { type: "review", text: "把昨天真实面试被问到的题回填进「真题库」,今晚生成一次针对性练习。" },
    ],
    encouragement: "弱点清单比上周短了一条,按这个节奏推进。",
  };
}

// ---------------- 单例 ----------------

export function getAI(): AIProvider {
  const useMock = !process.env.DEEPSEEK_API_KEY || process.env.DEBUG_AI !== "real";
  return useMock ? new MockAI() : new RealAI();
}
