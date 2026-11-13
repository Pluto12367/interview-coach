import { getAI } from "@/lib/ai/client";
import { safeJsonParse } from "@/lib/ai/json";
import {
  FORCED_CLOSING_LINE,
  FORCED_MOVE_ON_LINE,
  buildInterviewerSystemPrompt,
  threadOpeningLine,
} from "@/lib/prompts/interviewer";
import {
  addMessage,
  getSession,
  listMessages,
  setSessionEnded,
  updateSessionState,
  upsertWeakPoint,
} from "@/db";
import type { EngineState, PlanThread, SessionRow, TurnOutcome, TurnResult } from "@/lib/types";

/** 各环节类型的追问深度上限(代码层硬约束;调整这里,不要靠 prompt 硬扛) */
export const MAX_DEPTH_BY_TYPE: Record<PlanThread["type"], number> = {
  intro: 2,
  project: 3,
  knowledge: 2,
  scenario: 2,
  behavioral: 3,
  self_reflection: 2,
  motivation: 2,
};

const TOTAL_TURN_SOFT_LIMIT = 40;

export type { TurnOutcome };

function sanitizeTurnResult(raw: unknown): TurnResult {
  const r = (raw ?? {}) as Partial<TurnResult>;
  const cls = ["answered_ok", "answered_weak", "stuck"].includes(r.classification ?? "")
    ? r.classification!
    : "answered_weak";
  const act = ["follow_up", "move_on", "closing", "end"].includes(r.action ?? "") ? r.action! : "follow_up";
  const say = typeof r.say === "string" && r.say.trim() ? r.say.trim() : "嗯,能再展开说说吗?";
  return {
    classification: cls,
    action: act,
    say,
    threadDone: r.threadDone === true,
    weakPoint:
      r.weakPoint && typeof r.weakPoint.description === "string" && r.weakPoint.description.trim()
        ? { description: r.weakPoint.description.trim(), knowledgePoint: String(r.weakPoint.knowledgePoint ?? "") }
        : null,
    materialSuggestion: typeof r.materialSuggestion === "string" && r.materialSuggestion.trim() ? r.materialSuggestion.trim() : null,
    anchor: typeof r.anchor === "string" && r.anchor.trim() ? r.anchor.trim() : null,
  };
}

function toLLMMessages(rows: { role: string; content: string }[]) {
  return rows.map((m) => ({ role: m.role === "interviewer" ? ("assistant" as const) : ("user" as const), content: m.content }));
}

/** 会话创建后,由代码直接输出第一环节的开场白(零 LLM 调用) */
export function emitOpening(session: SessionRow): void {
  const msgs = listMessages(session.id);
  if (msgs.length > 0) return;
  const first = session.plan.threads[session.state.threadIdx] ?? session.plan.threads[0];
  addMessage({
    sessionId: session.id,
    role: "interviewer",
    threadId: first.id,
    content: threadOpeningLine(first, true),
  });
}

/** 处理候选人一轮回答:分类 → 决策(prompt 内) → 硬规则强制 → 状态推进 */
export async function processTurn(sessionId: number, userText: string): Promise<TurnOutcome> {
  const session = getSession(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.status !== "active" && session.status !== "closing") {
    throw new Error(`会话状态为 ${session.status},不可继续对话`);
  }

  const plan = session.plan;
  const state: EngineState = { ...session.state };
  const suggestions = [...session.suggestions];

  const thread: PlanThread | undefined = plan.threads[Math.min(state.threadIdx, plan.threads.length - 1)];
  const maxDepth = thread ? MAX_DEPTH_BY_TYPE[thread.type] : 2;

  // 1. 落库用户回答
  addMessage({ sessionId, role: "user", threadId: thread?.id ?? null, content: userText });

  // 2. 构造 prompt(系统状态注入硬约束,模型通常自行合规;代码只兜底)
  const isClosing = state.phase === "closing";
  const system = buildInterviewerSystemPrompt({
    mode: session.mode,
    plan,
    state,
    thread: thread ?? plan.threads[0],
    maxDepth,
  });
  const allMessages = toLLMMessages(listMessages(sessionId));

  const ai = getAI();
  const raw = await ai.chatJSON("interviewer", system, allMessages, {
    mockCtx: {
      threadType: thread?.type,
      threadTitle: thread?.title,
      depth: state.depth,
      stuck: state.stuck,
      phase: state.phase,
      turnCount: state.turnCount,
      userText,
      isLast: state.threadIdx === plan.threads.length - 1,
    },
  });
  let result = sanitizeTurnResult(safeJsonParse<unknown>(raw));

  // 3. 硬规则强制(仅覆盖 action;台词用预设自然短语兜底)
  const forced = { moved: false };
  if (!isClosing) {
    if (result.classification === "stuck") state.stuck += 1;
    else state.stuck = 0;

    if (result.action === "follow_up" && state.depth >= maxDepth) {
      result = { ...result, action: "move_on", say: FORCED_MOVE_ON_LINE, threadDone: true };
      forced.moved = true;
    }
    if (result.action === "follow_up" && result.classification === "stuck" && state.stuck >= 2) {
      result = { ...result, action: "move_on", say: FORCED_MOVE_ON_LINE, threadDone: true };
      forced.moved = true;
    }
    if (result.action === "move_on" && !result.say.trim()) result.say = FORCED_MOVE_ON_LINE;
  }

  // 4. 副产物:弱点回流 + 素材补充建议(飞轮齿轮)
  if (result.weakPoint) {
    upsertWeakPoint({ description: result.weakPoint.description, knowledgePoint: result.weakPoint.knowledgePoint, source: "session" });
  }
  if (result.materialSuggestion && !suggestions.includes(result.materialSuggestion)) {
    suggestions.push(result.materialSuggestion);
  }

  // 5. 按行动推进状态机,生成面试官消息(合并转场,单气泡)
  let lastSay = result.say;
  let ended = false;

  if (isClosing) {
    if (result.action === "end") {
      addMessage({ sessionId, role: "interviewer", threadId: null, content: result.say });
      setSessionEnded(sessionId, "reporting");
      ended = true;
      lastSay = result.say;
    } else {
      addMessage({ sessionId, role: "interviewer", threadId: null, content: result.say });
    }
  } else if (result.action === "follow_up") {
    state.depth += 1;
    addMessage({ sessionId, role: "interviewer", threadId: thread?.id ?? null, content: result.say });
  } else if (result.action === "move_on") {
    addMessage({ sessionId, role: "interviewer", threadId: thread?.id ?? null, content: result.say });
    const nextIdx = state.threadIdx + 1;
    const next = plan.threads[nextIdx];
    if (next) {
      state.threadIdx = nextIdx;
      state.depth = 0;
      state.stuck = 0;
      const opening = threadOpeningLine(next, false);
      addMessage({ sessionId, role: "interviewer", threadId: next.id, content: opening });
      lastSay = `${result.say} ${opening}`;
    } else {
      state.phase = "closing";
      addMessage({ sessionId, role: "interviewer", threadId: null, content: FORCED_CLOSING_LINE });
      lastSay = FORCED_CLOSING_LINE;
    }
  } else if (result.action === "closing") {
    state.phase = "closing";
    const line = result.say || FORCED_CLOSING_LINE;
    addMessage({ sessionId, role: "interviewer", threadId: null, content: line });
    lastSay = line;
  } else {
    // end 出现在 interview 阶段(异常):视为 closing
    state.phase = "closing";
    addMessage({ sessionId, role: "interviewer", threadId: null, content: result.say || FORCED_CLOSING_LINE });
    lastSay = result.say || FORCED_CLOSING_LINE;
  }

  // 6. 持久化
  state.turnCount += 1;
  const softClosed = state.turnCount >= TOTAL_TURN_SOFT_LIMIT && state.phase === "interview";
  updateSessionState(sessionId, state, softClosed ? "closing" : undefined, suggestions);

  const currentThread = plan.threads[Math.min(state.threadIdx, plan.threads.length - 1)];
  return {
    say: lastSay,
    action: result.action,
    progress: {
      threadIndex: Math.min(state.threadIdx + 1, plan.threads.length),
      total: plan.threads.length,
      title: state.phase === "closing" ? "反问环节" : currentThread?.title ?? "",
    },
    phase: state.phase,
    ended,
  };
}

/** 手动/自然结束面试:状态置为 reporting 并异步触发报告生成 */
export function finishSession(sessionId: number): void {
  const session = getSession(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.status === "reporting" || session.status === "done") return;
  setSessionEnded(sessionId, "reporting");
}
