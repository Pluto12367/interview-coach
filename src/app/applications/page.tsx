"use client";

import { useCallback, useEffect, useState } from "react";
import { Btn, Card, Empty, Field, api, inputCls } from "@/components/ui";
import type { ApplicationRow, AppStatus } from "@/lib/types";

const STATUSES: AppStatus[] = ["投递中", "笔试", "面试中", "Offer", "挂了", "无消息"];

export default function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setApps(await api<ApplicationRow[]>("/api/applications"));
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const add = async () => {
    if (!company.trim()) return setErr("公司必填");
    setBusy(true);
    setErr("");
    try {
      await api("/api/applications", {
        method: "POST",
        body: JSON.stringify({ company, position, deadline: deadline || null, notes: notes || null }),
      });
      setCompany("");
      setPosition("");
      setDeadline("");
      setNotes("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    await api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await load();
  };
  const remove = async (id: number) => {
    if (!confirm("删除这条投递记录?")) return;
    await api(`/api/applications/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="page-title text-xl font-bold">投递追踪</h1>
      <p className="text-xs text-slate-400">纯 CRUD 留存锚点:每天来这里更新状态、看截止日期,顺便练一条弱点。</p>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      <Card title="新增投递">
        <div className="grid grid-cols-[1fr_1fr_160px_1fr_auto] items-end gap-3">
          <Field label="公司"><input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <Field label="岗位"><input className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
          <Field label="截止/笔试日"><input type="date" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
          <Field label="备注"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Btn onClick={add} disabled={busy}>添加</Btn>
        </div>
      </Card>

      {apps.length === 0 ? (
        <Empty text="暂无投递记录。" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="pb-2">公司 · 岗位</th>
                <th className="pb-2">状态</th>
                <th className="pb-2">截止</th>
                <th className="pb-2">备注</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apps.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 font-medium text-slate-700">{a.company}<span className="ml-1 font-normal text-slate-400">{a.position}</span></td>
                  <td>
                    <select className="rounded-md border border-slate-200 px-2 py-1 text-xs" value={a.status} onChange={(e) => patch(a.id, { status: e.target.value })}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="text-slate-500">{a.deadline ?? "-"}</td>
                  <td className="max-w-[200px] truncate text-slate-400">{a.notes ?? "-"}</td>
                  <td className="text-right"><Btn variant="danger" onClick={() => remove(a.id)}>删除</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
