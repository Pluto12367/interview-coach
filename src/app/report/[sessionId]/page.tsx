"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card, Empty, api } from "@/components/ui";
import type { ReportData } from "@/lib/types";

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  strong_pass: { label: "明显通过", cls: "bg-emerald-500" },
  pass: { label: "可以通过", cls: "bg-sky-500" },
  borderline: { label: "边缘 · 待定", cls: "bg-amber-500" },
  fail: { label: "未通过", cls: "bg-red-500" },
};

export default function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [status, setStatus] = useState<"loading" | "generating" | "ready" | "failed">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    params.then((p) => setSessionId(Number(p.sessionId)));
  }, [params]);

  const poll = useCallback(async (id: number) => {
    try {
      const r = await api<{ status: "generating" | "ready" | "failed"; report: ReportData | null }>(`/api/reports/${id}`);
      if (r.status === "ready" && r.report) {
        setReport(r.report);
        setStatus("ready");
        return true;
      }
      if (r.status === "failed") {
        setStatus("failed");
        return true;
      }
      setStatus("generating");
    } catch {
      // 404:还没开始生成,继续等
      setStatus("generating");
    }
    return false;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let stop = false;
    const tick = async () => {
      const done = await poll(sessionId);
      if (!done && !stop) setTimeout(tick, 2500);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [sessionId, poll]);

  if (status !== "ready") {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-sm text-white/70">
          {status === "generating" ? "复盘报告生成中…(reasoner 深度分析)" : status === "failed" ? "报告生成失败,可回到会话重新结束一次。" : err || "加载中…"}
        </p>
        <Link className="mt-3 inline-block text-sm text-[#9db4ff] hover:underline" href="/">返回仪表盘</Link>
      </div>
    );
  }

  const v = VERDICT_STYLE[report!.overall.verdict] ?? VERDICT_STYLE.borderline;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title text-xl font-bold">复盘报告</h1>
        <div className="flex gap-2">
          <Link href="/review"><Btn variant="ghost">去练弱点</Btn></Link>
          <Link href="/interview/new"><Btn>再来一场</Btn></Link>
        </div>
      </div>

      <div className={`rounded-xl ${v.cls} p-5 text-white`}>
        <p className="text-sm opacity-90">面试官判定</p>
        <p className="mt-1 text-2xl font-bold">{v.label}</p>
        <p className="mt-2 text-sm opacity-95">{report!.overall.oneLine}</p>
      </div>

      <Card title="四维评分">
        <div className="grid grid-cols-2 gap-4">
          {report!.dimensions.map((d) => (
            <div key={d.key} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-medium">{d.name}</p>
                <p className={`text-2xl font-bold ${d.score >= 80 ? "text-emerald-600" : d.score >= 60 ? "text-amber-600" : "text-red-500"}`}>{d.score}</p>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${d.score >= 80 ? "bg-emerald-500" : d.score >= 60 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${d.score}%` }} />
              </div>
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-500">{d.evidence}</p>
              <p className="mt-2 text-xs text-red-600">问题:{d.issue}</p>
              <p className="mt-1 text-xs text-emerald-700">改写示范:{d.rewriteExample}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="最优先改进项(已写入弱点清单,下场面试加权出题)">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          {report!.topPriorities.map((p, i) => (
            <li key={i}>{p.description} {p.knowledgePoint && <Badge tone="indigo">{p.knowledgePoint}</Badge>}</li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title="STAR 缺口">
          {report!.starGaps.length === 0 ? <Empty text="无明显缺口" /> : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{report!.starGaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
          )}
        </Card>
        <Card title="建议补充的素材" actions={<Link className="text-xs text-indigo-500 hover:underline" href="/materials">去素材库</Link>}>
          {report!.materialSuggestions.length === 0 ? <Empty text="无" /> : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{report!.materialSuggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
          )}
        </Card>
      </div>

      <Card title="知识卡(面试中暴露的盲点)">
        {report!.knowledgeCards.length === 0 ? <Empty text="本场没有暴露知识盲点,或不足以成卡" /> : (
          <div className="space-y-2">
            {report!.knowledgeCards.map((c, i) => (
              <details key={i} className="rounded-lg border border-slate-100 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">Q: {c.q}</summary>
                <p className="mt-2 text-slate-600">A: {c.a}</p>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
