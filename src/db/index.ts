import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type {
  ApplicationRow,
  AppStatus,
  BriefData,
  ChatMessage,
  EngineState,
  JDAnalysis,
  JDRow,
  Material,
  MaterialType,
  ReportData,
  ReportStatus,
  SessionMode,
  SessionPlan,
  SessionRow,
  WeakPointRow,
  WeakPointStatus,
} from "@/lib/types";

// ---- 初始化(全局单例,dev HMR 复用;惰性打开,避免构建期锁库) ----

function createDb(): DatabaseSync {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      situation TEXT, task TEXT, action TEXT, result TEXT,
      metrics TEXT NOT NULL DEFAULT '[]',
      keywords TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'manual',
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL, url TEXT,
      status TEXT NOT NULL DEFAULT 'analyzing',
      analysis TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      jd_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      plan TEXT NOT NULL,
      state TEXT NOT NULL,
      suggestions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, ended_at TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      thread_id TEXT, content TEXT NOT NULL, meta TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS weak_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      knowledge_point TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS real_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL DEFAULT '', round TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL, position TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '投递中',
      deadline TEXT, notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

const g = globalThis as unknown as { __ic_db?: DatabaseSync };

function getDb(): DatabaseSync {
  g.__ic_db ??= createDb();
  return g.__ic_db;
}

/** 惰性代理:首次真正使用时才打开数据库(构建期 import 路由模块不会触发) */
export const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

const now = () => new Date().toISOString();

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function optStr(v: unknown): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function jsonArr(v: unknown): string[] {
  try {
    const arr = JSON.parse(str(v));
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

// ---- materials ----

function mapMaterial(r: Record<string, unknown>): Material {
  return {
    id: Number(r.id),
    type: str(r.type) as MaterialType,
    title: str(r.title),
    situation: optStr(r.situation),
    task: optStr(r.task),
    action: optStr(r.action),
    result: optStr(r.result),
    metrics: jsonArr(r.metrics),
    keywords: jsonArr(r.keywords),
    source: str(r.source),
    verified: Number(r.verified) === 1 ? 1 : 0,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function listMaterials(): Material[] {
  return db.prepare("SELECT * FROM materials ORDER BY updated_at DESC").all().map(mapMaterial);
}

export function getMaterial(id: number): Material | null {
  const r = db.prepare("SELECT * FROM materials WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapMaterial(r) : null;
}

export interface MaterialInput {
  type: MaterialType;
  title: string;
  situation?: string | null;
  task?: string | null;
  action?: string | null;
  result?: string | null;
  metrics?: string[];
  keywords?: string[];
  source?: string;
  verified?: 0 | 1;
}

export function createMaterial(input: MaterialInput): Material {
  const t = now();
  const res = db
    .prepare(
      `INSERT INTO materials (type,title,situation,task,action,result,metrics,keywords,source,verified,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      input.type,
      input.title,
      input.situation ?? null,
      input.task ?? null,
      input.action ?? null,
      input.result ?? null,
      JSON.stringify(input.metrics ?? []),
      JSON.stringify(input.keywords ?? []),
      input.source ?? "manual",
      input.verified ?? 0,
      t,
      t
    );
  return getMaterial(Number(res.lastInsertRowid))!;
}

export function updateMaterial(id: number, patch: Partial<MaterialInput> & { verified?: 0 | 1 }): Material | null {
  const cur = getMaterial(id);
  if (!cur) return null;
  db.prepare(
    `UPDATE materials SET type=?, title=?, situation=?, task=?, action=?, result=?, metrics=?, keywords=?, verified=?, updated_at=? WHERE id=?`
  ).run(
    patch.type ?? cur.type,
    patch.title ?? cur.title,
    patch.situation ?? cur.situation ?? null,
    patch.task ?? cur.task ?? null,
    patch.action ?? cur.action ?? null,
    patch.result ?? cur.result ?? null,
    JSON.stringify(patch.metrics ?? cur.metrics),
    JSON.stringify(patch.keywords ?? cur.keywords),
    patch.verified ?? cur.verified,
    now(),
    id
  );
  return getMaterial(id);
}

export function deleteMaterial(id: number): void {
  db.prepare("DELETE FROM materials WHERE id = ?").run(id);
}

// ---- JD ----

function mapJd(r: Record<string, unknown>): JDRow {
  let analysis: JDAnalysis | null = null;
  if (r.analysis) {
    try {
      analysis = JSON.parse(str(r.analysis)) as JDAnalysis;
    } catch {
      analysis = null;
    }
  }
  return {
    id: Number(r.id),
    company: str(r.company),
    position: str(r.position),
    rawText: str(r.raw_text),
    url: optStr(r.url),
    status: str(r.status) as JDRow["status"],
    analysis,
    createdAt: str(r.created_at),
  };
}

export function listJds(): JDRow[] {
  return db.prepare("SELECT * FROM jds ORDER BY created_at DESC").all().map(mapJd);
}

export function getJd(id: number): JDRow | null {
  const r = db.prepare("SELECT * FROM jds WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapJd(r) : null;
}

export function createJd(input: { company?: string; position?: string; rawText: string; url?: string | null }): JDRow {
  const res = db
    .prepare(`INSERT INTO jds (company, position, raw_text, url, status, created_at) VALUES (?,?,?,?, 'analyzing', ?)`)
    .run(input.company ?? "", input.position ?? "", input.rawText, input.url ?? null, now());
  return getJd(Number(res.lastInsertRowid))!;
}

export function setJdAnalysis(id: number, status: JDRow["status"], analysis: JDAnalysis | null, company?: string, position?: string): void {
  db.prepare(`UPDATE jds SET status=?, analysis=?, company=COALESCE(?, company), position=COALESCE(?, position) WHERE id=?`).run(
    status,
    analysis ? JSON.stringify(analysis) : null,
    company ?? null,
    position ?? null,
    id
  );
}

// ---- sessions / messages ----

function mapSession(r: Record<string, unknown>): SessionRow {
  return {
    id: Number(r.id),
    mode: str(r.mode) as SessionMode,
    jdId: r.jd_id == null ? null : Number(r.jd_id),
    status: str(r.status) as SessionRow["status"],
    plan: JSON.parse(str(r.plan)) as SessionPlan,
    state: JSON.parse(str(r.state)) as EngineState,
    suggestions: jsonArr(r.suggestions),
    createdAt: str(r.created_at),
    endedAt: optStr(r.ended_at),
  };
}

export function listSessions(): SessionRow[] {
  return db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all().map(mapSession);
}

export function getSession(id: number): SessionRow | null {
  const r = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapSession(r) : null;
}

export function createSession(input: { mode: SessionMode; jdId: number | null; plan: SessionPlan }): SessionRow {
  const state: EngineState = { threadIdx: 0, depth: 0, stuck: 0, phase: "interview", turnCount: 0 };
  const res = db
    .prepare(`INSERT INTO sessions (mode, jd_id, status, plan, state, suggestions, created_at) VALUES (?,?, 'active', ?, ?, '[]', ?)`)
    .run(input.mode, input.jdId, JSON.stringify(input.plan), JSON.stringify(state), now());
  return getSession(Number(res.lastInsertRowid))!;
}

export function updateSessionState(id: number, state: EngineState, status?: SessionRow["status"], suggestions?: string[]): void {
  db.prepare(`UPDATE sessions SET state=?, status=COALESCE(?, status), suggestions=? WHERE id=?`).run(
    JSON.stringify(state),
    status ?? null,
    JSON.stringify(suggestions ?? []),
    id
  );
}

export function setSessionEnded(id: number, status: SessionRow["status"]): void {
  db.prepare(`UPDATE sessions SET status=?, ended_at=? WHERE id=?`).run(status, now(), id);
}

function mapMessage(r: Record<string, unknown>): ChatMessage {
  return {
    id: Number(r.id),
    sessionId: Number(r.session_id),
    role: str(r.role) as ChatMessage["role"],
    threadId: optStr(r.thread_id),
    content: str(r.content),
    meta: optStr(r.meta),
    createdAt: str(r.created_at),
  };
}

export function addMessage(m: { sessionId: number; role: ChatMessage["role"]; threadId?: string | null; content: string; meta?: unknown }): ChatMessage {
  const res = db
    .prepare(`INSERT INTO messages (session_id, role, thread_id, content, meta, created_at) VALUES (?,?,?,?,?,?)`)
    .run(m.sessionId, m.role, m.threadId ?? null, m.content, m.meta ? JSON.stringify(m.meta) : null, now());
  const r = db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return mapMessage(r);
}

export function listMessages(sessionId: number): ChatMessage[] {
  return db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC").all(sessionId).map(mapMessage);
}

// ---- reports ----

export function saveReport(sessionId: number, data: ReportData): void {
  db.prepare(`INSERT INTO reports (session_id, content, created_at) VALUES (?,?,?)
               ON CONFLICT(session_id) DO UPDATE SET content=excluded.content, created_at=excluded.created_at`).run(
    sessionId,
    JSON.stringify(data),
    now()
  );
}

export function getReport(sessionId: number): { status: ReportStatus; report: ReportData | null } {
  const session = getSession(sessionId);
  const r = db.prepare("SELECT * FROM reports WHERE session_id = ?").get(sessionId) as Record<string, unknown> | undefined;
  if (r) return { status: "ready", report: JSON.parse(str(r.content)) as ReportData };
  if (!session) return { status: "failed", report: null };
  if (session.status === "reporting") return { status: "generating", report: null };
  return { status: "failed", report: null };
}

// ---- weak points ----

function mapWeakPoint(r: Record<string, unknown>): WeakPointRow {
  return {
    id: Number(r.id),
    description: str(r.description),
    knowledgePoint: str(r.knowledge_point),
    status: str(r.status) as WeakPointStatus,
    source: str(r.source),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function listWeakPoints(): WeakPointRow[] {
  return db.prepare("SELECT * FROM weak_points ORDER BY updated_at DESC").all().map(mapWeakPoint);
}

/** 去重:同知识点 + 相同描述(精确)视为同一条 */
export function upsertWeakPoint(input: { description: string; knowledgePoint: string; source: string }): WeakPointRow | null {
  const desc = input.description.trim();
  if (!desc) return null;
  const exist = db
    .prepare(`SELECT * FROM weak_points WHERE knowledge_point = ? AND description = ?`)
    .get(input.knowledgePoint ?? "", desc) as Record<string, unknown> | undefined;
  if (exist) {
    db.prepare(`UPDATE weak_points SET updated_at = ? WHERE id = ?`).run(now(), Number(exist.id));
    return mapWeakPoint(db.prepare("SELECT * FROM weak_points WHERE id = ?").get(Number(exist.id)) as Record<string, unknown>);
  }
  const res = db
    .prepare(`INSERT INTO weak_points (description, knowledge_point, status, source, created_at, updated_at) VALUES (?,?, 'open', ?, ?, ?)`)
    .run(desc, input.knowledgePoint ?? "", input.source, now(), now());
  return mapWeakPoint(db.prepare("SELECT * FROM weak_points WHERE id = ?").get(Number(res.lastInsertRowid)) as Record<string, unknown>);
}

export function updateWeakPointStatus(id: number, status: WeakPointStatus): WeakPointRow | null {
  db.prepare(`UPDATE weak_points SET status=?, updated_at=? WHERE id=?`).run(status, now(), id);
  const r = db.prepare("SELECT * FROM weak_points WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapWeakPoint(r) : null;
}

/** 把出题计划中覆盖到的弱点标记为「已练」(面试结束/报告生成时) */
export function markWeakPointsDrilled(refIds: number[]): void {
  for (const id of refIds) {
    db.prepare(`UPDATE weak_points SET status='drilled', updated_at=? WHERE id=? AND status='open'`).run(now(), id);
  }
}

// ---- real questions ----

export function listRealQuestions(): { id: number; company: string; round: string; text: string; createdAt: string }[] {
  return db
    .prepare("SELECT * FROM real_questions ORDER BY created_at DESC")
    .all()
    .map((r) => ({
      id: Number(r.id),
      company: str(r.company),
      round: str(r.round),
      text: str(r.text),
      createdAt: str(r.created_at),
    }));
}

export function createRealQuestion(input: { company: string; round: string; text: string }): void {
  db.prepare(`INSERT INTO real_questions (company, round, text, created_at) VALUES (?,?,?,?)`).run(
    input.company,
    input.round,
    input.text,
    now()
  );
}

// ---- applications ----

function mapApplication(r: Record<string, unknown>): ApplicationRow {
  return {
    id: Number(r.id),
    company: str(r.company),
    position: str(r.position),
    status: str(r.status) as AppStatus,
    deadline: optStr(r.deadline),
    notes: optStr(r.notes),
    createdAt: str(r.created_at),
  };
}

export function listApplications(): ApplicationRow[] {
  return db.prepare("SELECT * FROM applications ORDER BY created_at DESC").all().map(mapApplication);
}

export function createApplication(input: { company: string; position: string; status?: AppStatus; deadline?: string | null; notes?: string | null }): ApplicationRow {
  const res = db
    .prepare(`INSERT INTO applications (company, position, status, deadline, notes, created_at) VALUES (?,?,?,?,?,?)`)
    .run(input.company, input.position, input.status ?? "投递中", input.deadline ?? null, input.notes ?? null, now());
  return mapApplication(db.prepare("SELECT * FROM applications WHERE id = ?").get(Number(res.lastInsertRowid)) as Record<string, unknown>);
}

export function updateApplication(id: number, patch: { status?: AppStatus; deadline?: string | null; notes?: string | null }): ApplicationRow | null {
  const cur = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!cur) return null;
  db.prepare(`UPDATE applications SET status=?, deadline=?, notes=? WHERE id=?`).run(
    patch.status ?? str(cur.status),
    patch.deadline ?? optStr(cur.deadline),
    patch.notes ?? optStr(cur.notes),
    id
  );
  return mapApplication(db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteApplication(id: number): void {
  db.prepare("DELETE FROM applications WHERE id = ?").run(id);
}

// ---- briefs ----

export function saveBrief(date: string, data: BriefData): void {
  db.prepare(`INSERT INTO briefs (date, content, created_at) VALUES (?,?,?)
               ON CONFLICT(date) DO UPDATE SET content=excluded.content, created_at=excluded.created_at`).run(
    date,
    JSON.stringify(data),
    now()
  );
}

export function getLatestBrief(): { date: string; data: BriefData } | null {
  const r = db.prepare("SELECT * FROM briefs ORDER BY date DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!r) return null;
  try {
    return { date: str(r.date), data: JSON.parse(str(r.content)) as BriefData };
  } catch {
    return null;
  }
}
