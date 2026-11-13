"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Btn, Card, Empty, Field, api, inputCls } from "@/components/ui";
import type { WeakPointRow, WeakPointStatus } from "@/lib/types";

const STATUS_LABEL: Record<WeakPointStatus, string> = { open: "待练", drilled: "已练", cleared: "已消除" };
const STATUS_TONE: Record<WeakPointStatus, "red" | "amber" | "green"> = { open: "red", drilled: "amber", cleared: "green" };

export default function ReviewPage() {
  const [weakPoints, setWeakPoints] = useState<WeakPointRow[]>([]);
  const [questions, setQuestions] = useState<{ id: number; company: string; round: string; text: string; createdAt: string }[]>([]);
  const [company, setCompany] = useState("");
  const [round, setRound] = useState("一面");
  const [text, setText] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newKp, setNewKp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, q] = await Promise.all([api<WeakPointRow[]>("/api/weak-points"), api<{ id: number; company: string; round: string; text: string; createdAt: string }[]>("/api/real-questions")]);
    setWeakPoints(w);
    setQuestions(q);
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const addQuestion = async () => {
    if (!company.trim() || !text.trim()) return setErr("公司和题目必填");
    setBusy(true);
    setErr("");
    try {
      await api("/api/real-questions", { method: "POST", body: JSON.stringify({ company, round, text }) });
      setText("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: number, status: WeakPointStatus) => {
    await api(`/api/weak-points/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  };

  const addWeakPoint = async () => {
    if (!newDesc.trim()) return;
    await api("/api/weak-points", { method: "POST", body: JSON.stringify({ description: newDesc, knowledgePoint: newKp }) });
    setNewDesc("");
    setNewKp("");
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="page-title text-xl font-bold">复盘与真题</h1>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      <Card title="真题回填(面完真实面试,把被问到的题记下来——下场模拟加权覆盖)">
        <div className="grid grid-cols-[1fr_120px_2fr_auto] items-end gap-3">
          <Field label="公司"><input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <Field label="轮次"><input className={inputCls} value={round} onChange={(e) => setRound(e.target.value)} /></Field>
          <Field label="题目"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="把面试官问的题原样记下,越原样越有价值" /></Field>
          <Btn onClick={addQuestion} disabled={busy}>记录</Btn>
        </div>
        {questions.length === 0 ? (
          <div className="mt-4"><Empty text="还没有真题。第一次真实面试后回填,飞轮就开始转了。" /></div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {questions.map((q) => (
              <li key={q.id} className="flex items-center justify-between py-2">
                <span className="text-slate-600">{q.text}</span>
                <span className="flex shrink-0 gap-1">
                  <Badge tone="indigo">{q.company}</Badge>
                  <Badge>{q.round}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="弱点清单(飞轮的齿轮:待练 → 已练 → 已消除)">
        <div className="grid grid-cols-[2fr_1fr_auto] items-end gap-3">
          <Field label="新弱点描述(要具体可练习)"><input className={inputCls} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="如:项目经历没有量化结果" /></Field>
          <Field label="知识点"><input className={inputCls} value={newKp} onChange={(e) => setNewKp(e.target.value)} placeholder="如:量化表达" /></Field>
          <Btn onClick={addWeakPoint} variant="soft">手动添加</Btn>
        </div>
        {weakPoints.length === 0 ? (
          <div className="mt-4"><Empty text="暂无弱点。完成第一场模拟面试后,报告会自动写入。" /></div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {weakPoints.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="text-slate-700">{w.description}</span>
                  {w.knowledgePoint && <Badge tone="indigo">{w.knowledgePoint}</Badge>}
                  <span className="ml-2 text-[11px] text-slate-400">来源:{w.source}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[w.status]}>{STATUS_LABEL[w.status]}</Badge>
                  <select className="rounded-md border border-slate-200 px-1.5 py-1 text-xs" value={w.status} onChange={(e) => setStatus(w.id, e.target.value as WeakPointStatus)}>
                    <option value="open">待练</option>
                    <option value="drilled">已练</option>
                    <option value="cleared">已消除</option>
                  </select>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
