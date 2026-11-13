"use client";

/** 轻量 UI 原语 + 统一 fetch 封装(深海蓝玻璃拟态主题) */

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });
  let body: { ok?: boolean; data?: T; error?: string };
  try {
    body = await res.json();
  } catch {
    throw new Error(`请求失败(HTTP ${res.status})`);
  }
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `请求失败(HTTP ${res.status})`);
  return body.data as T;
}

export function Card({ title, children, actions, className }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`glass-card rounded-2xl p-5 ${className ?? ""}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const BTN_BASE =
  "inline-flex items-center justify-center rounded-xl px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const styles = {
    primary:
      "bg-gradient-to-br from-[#4d6bfe] to-[#6f8bff] text-white shadow-md shadow-[#4d6bfe]/35 hover:brightness-110 active:scale-[0.98]",
    ghost:
      "border border-white/60 bg-white/60 text-slate-700 backdrop-blur hover:bg-white/85",
    soft: "bg-[#4d6bfe]/12 text-[#3d56d4] hover:bg-[#4d6bfe]/22",
    danger:
      "border border-red-200/70 bg-white/60 text-red-600 backdrop-blur hover:bg-red-50",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${BTN_BASE} ${styles} ${className ?? ""}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "indigo" }) {
  const tones = {
    slate: "bg-slate-900/8 text-slate-600",
    green: "bg-emerald-500/15 text-emerald-700",
    amber: "bg-amber-500/18 text-amber-700",
    red: "bg-red-500/15 text-red-600",
    blue: "bg-sky-500/15 text-sky-700",
    indigo: "bg-[#4d6bfe]/15 text-[#3d56d4]",
  }[tone];
  return <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export const inputCls =
  "w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-slate-700 outline-none backdrop-blur transition placeholder:text-slate-400 focus:border-[#4d6bfe] focus:bg-white/90 focus:ring-4 focus:ring-[#4d6bfe]/15";
export const labelCls = "mb-1 block text-xs font-medium text-slate-500";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-400/40 bg-white/40 px-4 py-6 text-center text-sm text-slate-500 backdrop-blur-sm">
      {text}
    </p>
  );
}

/** 页面标题(直接落在壁纸上,白色 + 投影) */
export function PageTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="page-title text-xl font-bold">{children}</h1>
      {actions}
    </div>
  );
}
