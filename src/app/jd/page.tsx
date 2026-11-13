"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card, Empty, Field, api, inputCls } from "@/components/ui";
import type { JDRow } from "@/lib/types";

const VERDICT: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  strong: { label: "强匹配", tone: "green" },
  weak: { label: "证据不足", tone: "amber" },
  missing: { label: "缺失", tone: "red" },
};

export default function JdPage() {
  const [jds, setJds] = useState<JDRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const list = await api<JDRow[]>("/api/jd");
    setJds(list);
    setSelectedId((cur) => cur ?? list[0]?.id ?? null);
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  // 分析中自动轮询
  useEffect(() => {
    const analyzing = jds.some((j) => j.id === selectedId && j.status === "analyzing");
    if (!analyzing) return;
    const t = setTimeout(() => load().catch(() => {}), 2000);
    return () => clearTimeout(t);
  }, [jds, selectedId, load]);

  const submit = async () => {
    if (!rawText.trim()) return setErr("请粘贴 JD 原文");
    setBusy(true);
    setErr("");
    try {
      const jd = await api<JDRow>("/api/jd", { method: "POST", body: JSON.stringify({ company, position, rawText }) });
      await load();
      setSelectedId(jd.id);
      setRawText("");
      setCompany("");
      setPosition("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selected = jds.find((j) => j.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="page-title text-xl font-bold">JD 分析</h1>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      <Card title="提交新 JD(粘贴职位描述原文)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="公司"><input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <Field label="岗位"><input className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
          <div className="col-span-2">
            <Field label="JD 原文"><textarea rows={6} className={inputCls} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="粘贴职位描述…" /></Field>
          </div>
        </div>
        <div className="mt-3"><Btn onClick={submit} disabled={busy}>{busy ? "提交中…" : "提交分析"}</Btn></div>
      </Card>

      <div className="grid grid-cols-[220px_1fr] gap-4">
        <Card title="历史 JD" className="h-fit">
          {jds.length === 0 ? <Empty text="暂无" /> : (
            <ul className="space-y-1 text-sm">
              {jds.map((j) => (
                <li key={j.id}>
                  <button
                    onClick={() => setSelectedId(j.id)}
                    className={`w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 ${j.id === selectedId ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}
                  >
                    {j.company || "(未命名公司)"}·{j.position || "岗位"}
                    <span className="ml-1 text-xs">{j.status === "ready" ? "✓" : j.status === "analyzing" ? "…" : "✗"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {!selected ? (
            <Empty text="选择或提交一个 JD。" />
          ) : selected.status === "analyzing" ? (
            <Card><p className="py-8 text-center text-sm text-slate-400">分析中…(reasoner 深度解析,约 30~60 秒)</p></Card>
          ) : selected.status === "failed" ? (
            <Card><p className="py-8 text-center text-sm text-red-500">分析失败,请重新提交。</p></Card>
          ) : selected.analysis ? (
            <>
              <Card title={`${selected.analysis.company} · ${selected.analysis.position}`}>
                <p className="text-sm leading-relaxed text-slate-600">{selected.analysis.summary}</p>
              </Card>
              <Card title="要求与匹配矩阵(转化钩子:强/弱/缺一眼看清)">
                <ul className="space-y-2 text-sm">
                  {selected.analysis.matchMatrix.map((row, i) => (
                    <li key={i} className="rounded-lg border border-slate-100 p-3">
                      <p className="flex items-center gap-2">
                        <Badge tone={VERDICT[row.verdict]?.tone ?? "slate"}>{VERDICT[row.verdict]?.label ?? row.verdict}</Badge>
                        <span className="font-medium text-slate-700">{row.requirement}</span>
                      </p>
                      {row.evidence && <p className="mt-1 text-xs text-slate-500">证据:{row.evidence}</p>}
                      {row.suggestion && row.verdict !== "strong" && <p className="mt-1 text-xs text-amber-700">建议:{row.suggestion}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="预测题清单" actions={<Link href={`/interview/new?jdId=${selected.id}`}><Btn>用此 JD 发起面试</Btn></Link>}>
                <ul className="space-y-1 text-sm">
                  {selected.analysis.predictedQuestions.map((q, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 border-b border-slate-50 py-1.5 last:border-0">
                      <span className="text-slate-600">{q.text}</span>
                      <span className="flex shrink-0 gap-1">
                        <Badge>{q.source}</Badge>
                        <Badge tone={q.difficulty === "hard" ? "red" : q.difficulty === "medium" ? "amber" : "green"}>{q.difficulty}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
