"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Btn, Card, Empty, Field, api, inputCls } from "@/components/ui";
import type { Material, MaterialType } from "@/lib/types";

const TYPE_LABEL: Record<MaterialType, string> = {
  project: "项目",
  internship: "实习",
  competition: "竞赛",
  skill: "技能",
};

interface MaterialForm {
  type: MaterialType;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  metrics: string;
  keywords: string;
}

const EMPTY_FORM: MaterialForm = { type: "project", title: "", situation: "", task: "", action: "", result: "", metrics: "", keywords: "" };

function toForm(m: Material): MaterialForm {
  return {
    type: m.type,
    title: m.title,
    situation: m.situation ?? "",
    task: m.task ?? "",
    action: m.action ?? "",
    result: m.result ?? "",
    metrics: m.metrics.join(", "),
    keywords: m.keywords.join(", "),
  };
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [form, setForm] = useState<MaterialForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<{ selfIntro: string; materials: MaterialForm[]; warnings: string[] } | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMaterials(await api<Material[]>("/api/materials"));
  }, []);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const set = (patch: Partial<MaterialForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.title.trim()) return setErr("标题不能为空");
    setBusy(true);
    setErr("");
    const payload = {
      type: form.type,
      title: form.title.trim(),
      situation: form.situation || null,
      task: form.task || null,
      action: form.action || null,
      result: form.result || null,
      metrics: form.metrics.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      keywords: form.keywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editingId) await api(`/api/materials/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/materials", { method: "POST", body: JSON.stringify({ ...payload, verified: 1 }) });
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const extract = async () => {
    if (!resumeText.trim()) return setErr("请粘贴简历文本");
    setExtracting(true);
    setErr("");
    try {
      const data = await api<{ selfIntro: string; materials: MaterialForm[]; warnings: string[] }>("/api/materials/extract", {
        method: "POST",
        body: JSON.stringify({ text: resumeText }),
      });
      setPreview(data);
      setSelected(data.materials.map(() => true));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  const importSelected = async () => {
    if (!preview) return;
    const items = preview.materials.filter((_, i) => selected[i]).map((f) => ({
      type: f.type,
      title: f.title,
      situation: f.situation || null,
      task: f.task || null,
      action: f.action || null,
      result: f.result || null,
      metrics: f.metrics.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      keywords: f.keywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    }));
    setBusy(true);
    try {
      await api("/api/materials/import", { method: "POST", body: JSON.stringify({ items }) });
      setPreview(null);
      setResumeText("");
      setShowExtract(false);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleVerified = async (m: Material) => {
    await api(`/api/materials/${m.id}`, { method: "PATCH", body: JSON.stringify({ verified: m.verified === 1 ? 0 : 1 }) });
    await load();
  };
  const remove = async (id: number) => {
    if (!confirm("确认删除这条素材?")) return;
    await api(`/api/materials/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title text-xl font-bold">素材库</h1>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setShowExtract((v) => !v)}>从简历抽取</Btn>
          <Btn onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(EMPTY_FORM); }}>手动添加</Btn>
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      {showForm && (
        <Card title={editingId ? "编辑素材" : "新素材(确认后才参与出题)"}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <select className={inputCls} value={form.type} onChange={(e) => set({ type: e.target.value as MaterialType })}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="标题"><input className={inputCls} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="如:校园二手交易平台" /></Field>
            <Field label="情境 S"><input className={inputCls} value={form.situation} onChange={(e) => set({ situation: e.target.value })} /></Field>
            <Field label="任务 T"><input className={inputCls} value={form.task} onChange={(e) => set({ task: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="做法 A(技术方案,面试官深挖的依据)"><textarea rows={2} className={inputCls} value={form.action} onChange={(e) => set({ action: e.target.value })} /></Field></div>
            <div className="col-span-2"><Field label="结果 R"><input className={inputCls} value={form.result} onChange={(e) => set({ result: e.target.value })} /></Field></div>
            <Field label="量化(逗号分隔)"><input className={inputCls} value={form.metrics} onChange={(e) => set({ metrics: e.target.value })} placeholder="P99 800ms→120ms, QPS 500" /></Field>
            <Field label="关键词(逗号分隔)"><input className={inputCls} value={form.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="Java, Redis, 缓存" /></Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Btn onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>取消</Btn>
          </div>
        </Card>
      )}

      {showExtract && (
        <Card title="简历抽取(粘贴文本 → 预览 → 确认入库)">
          <textarea rows={6} className={inputCls} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="粘贴简历全文或部分经历文本…" />
          <div className="mt-3"><Btn onClick={extract} disabled={extracting}>{extracting ? "抽取中…" : "开始抽取"}</Btn></div>
          {preview && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600"><span className="font-medium">自我介绍草稿:</span>{preview.selfIntro}</p>
              {preview.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {preview.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}
              {preview.materials.map((m, i) => (
                <label key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={selected[i]} onChange={() => setSelected((s) => s.map((v, j) => (j === i ? !v : v)))} />
                  <span>
                    <span className="font-medium">{m.title}</span> <Badge>{TYPE_LABEL[m.type as MaterialType]}</Badge>
                    <span className="mt-1 block text-xs text-slate-500">A: {m.action || "-"} | R: {m.result || "-"} | 量化: {m.metrics || "-"}</span>
                  </span>
                </label>
              ))}
              <Btn onClick={importSelected} disabled={busy}>{busy ? "导入中…" : "导入选中素材"}</Btn>
            </div>
          )}
        </Card>
      )}

      {materials.length === 0 ? (
        <Empty text="素材库是空的。面试官只能深挖你确认过的素材——先录入 2~3 段真实经历。" />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {materials.map((m) => (
            <Card key={m.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {m.title}
                    <Badge tone="indigo">{TYPE_LABEL[m.type]}</Badge>
                    {m.verified === 1 ? <Badge tone="green">已确认</Badge> : <Badge tone="amber">未确认</Badge>}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {m.situation && <span>S:{m.situation} </span>}
                    {m.task && <span>| T:{m.task} </span>}
                    {m.action && <span>| A:{m.action} </span>}
                    {m.result && <span>| R:{m.result}</span>}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {m.metrics.map((x) => <Badge key={x} tone="blue">{x}</Badge>)}
                    {m.keywords.map((x) => <Badge key={x}>{x}</Badge>)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="flex gap-2">
                    <Btn variant="ghost" onClick={() => { setShowForm(true); setEditingId(m.id); setForm(toForm(m)); }}>编辑</Btn>
                    <Btn variant="ghost" onClick={() => toggleVerified(m)}>{m.verified === 1 ? "取消确认" : "确认"}</Btn>
                    <Btn variant="danger" onClick={() => remove(m.id)}>删除</Btn>
                  </span>
                  <span className="text-[11px] text-slate-400">来源:{m.source}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
