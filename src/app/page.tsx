"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card, Empty, api } from "@/components/ui";
import type { ApplicationRow, BriefData, Material, SessionRow, WeakPointRow } from "@/lib/types";

const MODE_LABEL: Record<string, string> = { tech: "技术面", hr: "HR 面" };
const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue" | "indigo"> = {
  active: "green",
  closing: "amber",
  reporting: "amber",
  done: "slate",
};
const STATUS_LABEL: Record<string, string> = { active: "进行中", closing: "反问环节", reporting: "生成报告中", done: "已完成" };

export default function Dashboard() {
  const [brief, setBrief] = useState<{ date: string; data: BriefData } | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPointRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [genning, setGenning] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [b, s, m, w, a] = await Promise.all([
      api<{ date: string; data: BriefData } | null>("/api/brief").catch(() => null),
      api<SessionRow[]>("/api/sessions"),
      api<Material[]>("/api/materials"),
      api<WeakPointRow[]>("/api/weak-points"),
      api<ApplicationRow[]>("/api/applications"),
    ]);
    setBrief(b);
    setSessions(s);
    setMaterials(m);
    setWeakPoints(w);
    setApplications(a);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const genBrief = async () => {
    setGenning(true);
    setErr("");
    try {
      const b = await api<{ date: string; data: BriefData }>("/api/brief", { method: "POST" });
      setBrief(b);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGenning(false);
    }
  };

  const openWeak = weakPoints.filter((w) => w.status === "open");
  const deadlines = applications
    .filter((a) => a.deadline && a.status !== "Offer" && a.status !== "挂了")
    .sort((x, y) => (x.deadline! < y.deadline! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="page-title text-xl font-bold">仪表盘</h1>
        <Btn onClick={genBrief} disabled={genning}>{genning ? "生成中…" : "生成今日简报"}</Btn>
      </div>
      {err && <p className="rounded-xl border border-red-400/40 bg-red-950/55 px-3 py-2 text-sm text-red-100 backdrop-blur">{err}</p>}

      {/* Hero:呼应壁纸的 ✓ 清单 */}
      <div className="relative overflow-hidden rounded-2xl border border-white/30 bg-[#0d1b4d]/35 p-6 shadow-lg shadow-[#0a1233]/25 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-4 -top-10 select-none text-[130px] leading-none opacity-20">🐳</div>
        <p className="text-sm text-white/60">AI 模拟面试官 · 深挖你的简历与目标 JD</p>
        <h2 className="mt-1 text-2xl font-bold text-white">把每一次模拟,练成下一次的通过</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-white/90">
          <span className="rounded-full border border-[#8ea5ff]/40 bg-[#4d6bfe]/30 px-3 py-1 backdrop-blur">✓ 练得更深</span>
          <span className="rounded-full border border-[#8ea5ff]/40 bg-[#4d6bfe]/30 px-3 py-1 backdrop-blur">✓ 答得更准</span>
          <span className="rounded-full border border-[#8ea5ff]/40 bg-[#4d6bfe]/30 px-3 py-1 backdrop-blur">✓ Offer 更近</span>
        </div>
      </div>

      <Card title="今日简报">
        {brief ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-700">{brief.data.greeting}</p>
            {brief.data.items.map((it, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge tone={it.type === "deadline" ? "red" : it.type === "practice" ? "indigo" : "blue"}>
                  {it.type === "practice" ? "练习" : it.type === "deadline" ? "截止" : "复盘"}
                </Badge>
                <span className="text-slate-600">{it.text}</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-slate-400">{brief.data.encouragement}</p>
          </div>
        ) : (
          <Empty text="还没有简报。右上角生成一份,或先完善素材库。" />
        )}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-2xl font-bold text-indigo-600">{materials.filter((m) => m.verified === 1).length}</p>
          <p className="mt-1 text-xs text-slate-500">已确认素材 · <Link className="text-indigo-500 hover:underline" href="/materials">去管理</Link></p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-amber-600">{openWeak.length}</p>
          <p className="mt-1 text-xs text-slate-500">开放弱点 · <Link className="text-indigo-500 hover:underline" href="/review">去练习</Link></p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-sky-600">{sessions.filter((s) => s.status === "done").length}</p>
          <p className="mt-1 text-xs text-slate-500">已完成面试 · <Link className="text-indigo-500 hover:underline" href="/interview/new">再来一场</Link></p>
        </Card>
      </div>

      <Card title="近期面试">
        {sessions.length === 0 ? (
          <Empty text="还没有面试记录。完善素材库后,从「发起面试」开始第一场。" />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {sessions.slice(0, 6).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <Badge tone={s.mode === "tech" ? "indigo" : "blue"}>{MODE_LABEL[s.mode]}</Badge>
                  <span className="text-slate-600">{new Date(s.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-xs text-slate-400">{s.plan.threads.length} 个环节</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                  {s.status === "active" || s.status === "closing" ? (
                    <Link className="text-indigo-500 hover:underline" href={`/interview/${s.id}`}>继续</Link>
                  ) : (
                    <Link className="text-indigo-500 hover:underline" href={`/report/${s.id}`}>看报告</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="即将截止">
        {deadlines.length === 0 ? (
          <Empty text="没有待办截止项。" />
        ) : (
          <ul className="space-y-1 text-sm">
            {deadlines.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span className="text-slate-600">{a.company} · {a.position || a.status}</span>
                <Badge tone="red">{a.deadline}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
