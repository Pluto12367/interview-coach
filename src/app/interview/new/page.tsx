"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Btn, Card, Empty, api } from "@/components/ui";
import type { JDRow, Material, SessionMode, SessionRow } from "@/lib/types";

export default function NewInterviewPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-slate-400">加载中…</p>}>
      <NewInterviewInner />
    </Suspense>
  );
}

function NewInterviewInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [mode, setMode] = useState<SessionMode>("tech");
  const [jdId, setJdId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [jds, setJds] = useState<JDRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const q = sp.get("jdId");
    if (q) setJdId(Number(q));
    Promise.all([api<Material[]>("/api/materials"), api<JDRow[]>("/api/jd")])
      .then(([mats, jdList]) => {
        setMaterials(mats);
        setChecked(Object.fromEntries(mats.filter((m) => m.verified === 1).map((m) => [m.id, true])));
        setJds(jdList.filter((j) => j.status === "ready"));
      })
      .catch((e) => setErr(e.message));
  }, [sp]);

  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      const ids = Object.entries(checked).filter(([, v]) => v).map(([k]) => Number(k));
      const session = await api<SessionRow>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ mode, jdId, materialIds: ids.length ? ids : null }),
      });
      router.push(`/interview/${session.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="page-title text-xl font-bold">发起面试</h1>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      <Card title="面试类型">
        <div className="grid grid-cols-2 gap-3">
          {(["tech", "hr"] as SessionMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-xl border-2 p-4 text-left transition ${mode === m ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}
            >
              <p className="font-medium">{m === "tech" ? "技术面" : "HR 行为面"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {m === "tech" ? "项目深挖 + 基础原理 + 场景设计(约 7~8 环节)" : "经历追问 + 自省 + 求职动机(约 6~7 环节)"}
              </p>
            </button>
          ))}
        </div>
      </Card>

      <Card title="目标 JD(可选,强烈建议)">
        <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={jdId ?? ""} onChange={(e) => setJdId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">不指定(通用考察)</option>
          {jds.map((j) => <option key={j.id} value={j.id}>{j.company}·{j.position}</option>)}
        </select>
        {jds.length === 0 && <p className="mt-2 text-xs text-slate-400">还没有解析完成的 JD——先去「JD 分析」提交一个,针对性会强很多。</p>}
      </Card>

      <Card title="参与出题的素材(默认全部已确认素材)">
        {materials.length === 0 ? (
          <Empty text="素材库为空,面试官只能问通用题。建议先去「素材库」录入经历。" />
        ) : (
          <ul className="space-y-1 text-sm">
            {materials.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <input type="checkbox" checked={checked[m.id] ?? false} onChange={() => setChecked((c) => ({ ...c, [m.id]: !(c[m.id] ?? false) }))} />
                  <span>{m.title}</span>
                  {m.verified === 0 && <Badge tone="amber">未确认</Badge>}
                  <span className="ml-auto text-xs text-slate-400">{m.metrics.slice(0, 2).join(" / ")}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Btn onClick={start} disabled={busy} className="px-6 py-2.5">{busy ? "出题计划生成中…(约 5~20 秒)" : "开始面试"}</Btn>
        <span className="text-xs text-slate-400">文字模式;语音链路 W3 接入</span>
      </div>
    </div>
  );
}
