// ===== 领域类型:全产品共享 =====

export type MaterialType = "project" | "internship" | "competition" | "skill";
export type SessionMode = "tech" | "hr";
export type ThreadType =
  | "intro"
  | "project"
  | "knowledge"
  | "scenario"
  | "behavioral"
  | "self_reflection"
  | "motivation";
export type WeakPointStatus = "open" | "drilled" | "cleared";
export type AppStatus = "投递中" | "笔试" | "面试中" | "Offer" | "挂了" | "无消息";

// ---- 素材库 ----
export interface Material {
  id: number;
  type: MaterialType;
  title: string;
  situation: string | null;
  task: string | null;
  action: string | null;
  result: string | null;
  metrics: string[];
  keywords: string[];
  source: string; // manual | ocr | extract | session
  verified: 0 | 1; // 用户确认后才参与出题(防污染飞轮)
  createdAt: string;
  updatedAt: string;
}

// ---- JD ----
export interface JDRequirement {
  text: string;
  type: "hard" | "plus" | "implicit";
}
export interface MatchRow {
  requirement: string;
  verdict: "strong" | "weak" | "missing";
  evidence: string;
  suggestion: string;
}
export interface PredictedQuestion {
  text: string;
  source: string;
  difficulty: "easy" | "medium" | "hard";
}
export interface JDAnalysis {
  company: string;
  position: string;
  summary: string;
  requirements: JDRequirement[];
  matchMatrix: MatchRow[];
  predictedQuestions: PredictedQuestion[];
}
export interface JDRow {
  id: number;
  company: string;
  position: string;
  rawText: string;
  url: string | null;
  status: "analyzing" | "ready" | "failed";
  analysis: JDAnalysis | null;
  createdAt: string;
}

// ---- 出题计划 ----
export interface PlanThread {
  id: string;
  type: ThreadType;
  title: string;
  grounding: {
    source: "material" | "jd" | "weak_point" | "generic";
    refId: number | null;
    excerpt: string;
  };
  openingQuestion: string;
  focusPoints: string[];
}
export interface SessionPlan {
  threads: PlanThread[];
}

// ---- 追问决策(面试官单轮输出) ----
export interface TurnResult {
  classification: "answered_ok" | "answered_weak" | "stuck";
  action: "follow_up" | "move_on" | "closing" | "end";
  say: string;
  threadDone: boolean;
  weakPoint: { description: string; knowledgePoint: string } | null;
  materialSuggestion: string | null;
  anchor: string | null;
}

// ---- 复盘报告 ----
export interface ReportData {
  overall: { verdict: "strong_pass" | "pass" | "borderline" | "fail"; oneLine: string };
  dimensions: {
    key: string;
    name: string;
    score: number;
    evidence: string;
    issue: string;
    rewriteExample: string;
  }[];
  topPriorities: { description: string; knowledgePoint: string }[];
  newWeakPoints: { description: string; knowledgePoint: string }[];
  starGaps: string[];
  knowledgeCards: { q: string; a: string }[];
  materialSuggestions: string[];
}
export type ReportStatus = "generating" | "ready" | "failed";

// ---- 会话 ----
export interface EngineState {
  threadIdx: number;
  depth: number;
  stuck: number;
  phase: "interview" | "closing";
  turnCount: number;
}
export interface ChatMessage {
  id: number;
  sessionId: number;
  role: "interviewer" | "user";
  threadId: string | null;
  content: string;
  meta: string | null;
  createdAt: string;
}
export interface SessionRow {
  id: number;
  mode: SessionMode;
  jdId: number | null;
  status: "active" | "closing" | "reporting" | "done";
  plan: SessionPlan;
  state: EngineState;
  suggestions: string[];
  createdAt: string;
  endedAt: string | null;
}

// ---- 面试单轮处理结果(API 返回给前端) ----
export interface TurnOutcome {
  say: string;
  action: "follow_up" | "move_on" | "closing" | "end";
  progress: { threadIndex: number; total: number; title: string };
  phase: "interview" | "closing";
  ended: boolean;
}

// ---- 其他 ----
export interface WeakPointRow {
  id: number;
  description: string;
  knowledgePoint: string;
  status: WeakPointStatus;
  source: string; // report | session | manual | real_question
  createdAt: string;
  updatedAt: string;
}
export interface RealQuestionRow {
  id: number;
  company: string;
  round: string;
  text: string;
  createdAt: string;
}
export interface ApplicationRow {
  id: number;
  company: string;
  position: string;
  status: AppStatus;
  deadline: string | null;
  notes: string | null;
  createdAt: string;
}
export interface BriefData {
  date: string;
  greeting: string;
  items: { type: "practice" | "deadline" | "review"; text: string }[];
  encouragement: string;
}
