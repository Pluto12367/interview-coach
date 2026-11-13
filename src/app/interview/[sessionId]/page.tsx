"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, api } from "@/components/ui";
import type { ChatMessage, SessionRow, TurnOutcome } from "@/lib/types";
// TurnOutcome 定义在共享 types(避免客户端页面引入服务端引擎模块)

type VoiceState = "idle" | "listening" | "asr" | "thinking" | "speaking";

const RMS_THRESHOLD = 0.03; // 静音判定阈值
const SILENCE_MS = 900; // 设计:静音 800~1000ms 自动断句
const MAX_RECORD_MS = 30_000;

export default function InterviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ending, setEnding] = useState<"idle" | "generating">("idle");
  const bottomRef = useRef<HTMLDivElement>(null);

  // ---- 语音模式状态 ----
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false); // 自动播放被浏览器拦截
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const vadRef = useRef({ speech: false, silenceSince: 0, startTs: 0, active: false });
  const slotRef = useRef(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const bufRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    params.then((p) => setSessionId(Number(p.sessionId)));
  }, [params]);

  const load = useCallback(async (id: number) => {
    const data = await api<{ session: SessionRow; messages: ChatMessage[] }>(`/api/sessions/${id}`);
    setSession(data.session);
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    if (sessionId) load(sessionId).catch((e) => setErr(e.message));
  }, [sessionId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 卸载时释放麦克风/音频资源
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // 报告生成完成后跳转
  useEffect(() => {
    if (ending !== "generating" || !sessionId) return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ status: string }>(`/api/reports/${sessionId}`);
        if (r.status === "ready" || r.status === "failed") {
          clearInterval(t);
          router.push(`/report/${sessionId}`);
        }
      } catch {
        /* 轮询继续 */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [ending, sessionId, router]);

  // ---- 统一的回合发送(文字/语音共用) ----
  const sendTurn = useCallback(
    async (text: string, useVoice: boolean) => {
      if (!sessionId) return;
      setErr("");
      setMessages((ms) => [
        ...ms,
        { id: Date.now(), sessionId, role: "user", threadId: null, content: text, meta: null, createdAt: new Date().toISOString() },
      ]);
      setBusy(true);
      try {
        const outcome = await api<TurnOutcome>(`/api/sessions/${sessionId}/turn`, {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        await load(sessionId);
        if (outcome.ended) {
          // 服务端 turn 路由已触发报告生成,客户端进入轮询并自动跳转
          setEnding("generating");
          return;
        }
        if (useVoice && outcome.say) {
          setVoiceState("speaking");
          try {
            const res = await fetch("/api/voice/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: outcome.say }),
            });
            if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
            const url = URL.createObjectURL(await res.blob());
            setReplayUrl((old) => {
              if (old) URL.revokeObjectURL(old);
              return url;
            });
            await playUrl(url);
          } catch (e) {
            // TTS 失败不阻塞面试,文本气泡已经在
            setErr(`语音合成失败:${(e as Error).message}`);
          } finally {
            setVoiceState("idle");
          }
        }
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, load]
  );

  const playUrl = useCallback(async (url: string) => {
    audioElRef.current ??= new Audio();
    const a = audioElRef.current;
    a.src = url;
    try {
      await a.play(); // 浏览器拦截自动播放会 reject
      setNeedsTap(false);
    } catch {
      setNeedsTap(true);
    }
  }, []);

  // ---- 文字模式发送 ----
  const send = async () => {
    if (!input.trim() || busy || ending !== "idle") return;
    const text = input.trim();
    setInput("");
    await sendTurn(text, false);
  };

  // ---- 语音模式 ----
  const enableVoice = async () => {
    setErr("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("当前浏览器不支持麦克风采集,请使用文字模式");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setErr("当前浏览器不支持录音(MediaRecorder),请使用文字模式");
      return;
    }
    try {
      // getUserMedia 在无麦克风设备/权限弹窗无人响应时会永久挂起,加超时兜底
      const gum = navigator.mediaDevices.getUserMedia({ audio: true });
      gum.catch(() => {}); // 超时后原始 Promise 的拒绝不再引发 unhandled rejection
      const stream = await Promise.race([
        gum,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("麦克风请求超时(8 秒):若浏览器询问权限请允许后重试,或改用文字模式")), 8000)
        ),
      ]);
      streamRef.current = stream;
      const ctx = new AudioContext();
      await ctx.resume(); // 开关点击即用户手势,可恢复
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      bufRef.current = new Uint8Array(analyser.fftSize);
      setVoiceOn(true);
    } catch (e) {
      const msg = (e as Error).name === "NotAllowedError" ? "麦克风权限被拒绝,请在浏览器设置中允许后重试" : `麦克风初始化失败:${(e as Error).message}`;
      setErr(msg);
    }
  };

  const disableVoice = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    vadRef.current.active = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    streamRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
    setVoiceOn(false);
    setVoiceState("idle");
  };

  const startListening = () => {
    if (voiceState !== "idle" || !streamRef.current) return;
    setErr("");
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const recorder = mime ? new MediaRecorder(streamRef.current, { mimeType: mime }) : new MediaRecorder(streamRef.current);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => void handleStop(recorder.mimeType || "audio/webm");
    recorderRef.current = recorder;
    recorder.start();
    vadRef.current = { speech: false, silenceSince: 0, startTs: Date.now(), active: true };
    setVoiceState("listening");
    void vadLoop();
  };

  const vadLoop = async () => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!analyser || !buf || !vadRef.current.active) return;
    analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();
    const v = vadRef.current;
    if (rms > RMS_THRESHOLD) {
      v.speech = true;
      v.silenceSince = 0;
    } else if (v.speech) {
      if (!v.silenceSince) v.silenceSince = now;
      const silent = now - v.silenceSince;
      const held = now - v.startTs;
      if (silent >= SILENCE_MS && held >= 600) {
        stopListening();
        return;
      }
    }
    if (now - v.startTs >= MAX_RECORD_MS) {
      stopListening();
      return;
    }
    rafRef.current = requestAnimationFrame(() => void vadLoop());
  };

  const stopListening = () => {
    vadRef.current.active = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const r = recorderRef.current;
    if (r && r.state === "recording") r.stop();
  };

  const cancelListening = () => {
    vadRef.current.active = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const r = recorderRef.current;
    if (r && r.state === "recording") {
      chunksRef.current = [];
      r.onstop = null;
      r.stop();
    }
    setVoiceState("idle");
  };

  const handleStop = async (mime: string) => {
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    if (blob.size < 2000) {
      setVoiceState("idle");
      setErr("没听到声音,请靠近麦克风再试,或改用文字模式");
      return;
    }
    setVoiceState("asr");
    try {
      const slot = slotRef.current++;
      const res = await fetch(`/api/voice/asr?slot=${slot}`, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const body = (await res.json()) as { ok: boolean; data?: { text: string }; error?: string };
      if (!res.ok || body.ok === false || !body.data?.text?.trim()) {
        throw new Error(body.error ?? `ASR HTTP ${res.status}`);
      }
      setVoiceState("thinking");
      await sendTurn(body.data.text, true);
    } catch (e) {
      setErr(`语音识别失败:${(e as Error).message}`);
      setVoiceState("idle");
    }
  };

  const endNow = async () => {
    if (!sessionId || ending !== "idle") return;
    setErr("");
    try {
      await api(`/api/sessions/${sessionId}/end`, { method: "POST" });
      setEnding("generating");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (!session) {
    return <p className="mx-auto max-w-3xl py-20 text-center text-sm text-white/70">{err || "加载中…"}</p>;
  }

  const total = session.plan.threads.length;
  const done = session.status === "reporting" || session.status === "done";
  const progress =
    session.state.phase === "closing"
      ? "反问环节"
      : `环节 ${Math.min(session.state.threadIdx + 1, total)}/${total} · ${session.plan.threads[session.state.threadIdx]?.title ?? ""}`;

  const VOICE_HINT: Record<VoiceState, string> = {
    idle: "点击开始说话 · 说完停顿约 1 秒自动发送",
    listening: "正在聆听…说完停顿约 1 秒自动发送",
    asr: "识别中…",
    thinking: "面试官思考中…",
    speaking: "播放面试官回复…",
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col">
      <div className="glass-dock flex items-center justify-between rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="font-bold">{session.mode === "tech" ? "技术面试" : "HR 面试"}</h1>
          <Badge tone="indigo">{progress}</Badge>
          {voiceOn && <Badge tone="green">语音模式</Badge>}
          {session.suggestions.length > 0 && <Badge tone="amber">{session.suggestions.length} 条素材建议</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {done ? (
            <Btn onClick={() => router.push(`/report/${sessionId}`)}>查看报告</Btn>
          ) : voiceOn ? (
            <Btn variant="ghost" onClick={disableVoice}>文字模式</Btn>
          ) : (
            <Btn variant="ghost" onClick={enableVoice} disabled={busy}>🎙 语音模式</Btn>
          )}
          {!done && (
            <Btn variant="danger" onClick={endNow} disabled={ending === "generating"}>
              {ending === "generating" ? "报告生成中…" : "结束并生成报告"}
            </Btn>
          )}
        </div>
      </div>

      {ending === "generating" && (
        <p className="mt-3 rounded-xl border border-[#8ea5ff]/40 bg-[#4d6bfe]/30 px-3 py-2 text-sm text-white backdrop-blur">
          面试已结束,复盘报告生成中(约 30~60 秒)…完成后自动跳转。
        </p>
      )}
      {err && (
        <p className="mt-3 rounded-xl border border-red-400/40 bg-red-950/55 px-3 py-2 text-sm text-red-100 backdrop-blur">{err}</p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-lg ${
                m.role === "user"
                  ? "rounded-br-md bg-gradient-to-br from-[#4d6bfe] to-[#6f8bff] text-white shadow-[#4d6bfe]/30"
                  : "glass-dock rounded-bl-md text-slate-700"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区:语音 / 文字两种模式(DeepSeek App 式底部输入坞) */}
      <div className="mt-1">
        {done ? (
          <div className="glass-dock rounded-2xl py-3 text-center text-sm text-slate-400">面试已结束</div>
        ) : voiceOn ? (
          <div className="glass-dock flex flex-col items-center gap-2.5 rounded-2xl px-4 py-4">
            {voiceState === "idle" && (
              <button
                onClick={startListening}
                disabled={busy}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#4d6bfe] to-[#8ea5ff] text-2xl text-white shadow-xl shadow-[#4d6bfe]/45 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                title="开始说话"
              >
                🎙
              </button>
            )}
            {voiceState === "listening" && (
              <div className="flex items-center gap-3">
                <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40">
                  <span className="absolute h-12 w-12 animate-ping rounded-full bg-red-400 opacity-60" />
                  ●
                </span>
                <Btn variant="ghost" onClick={stopListening}>说完,发送</Btn>
                <Btn variant="danger" onClick={cancelListening}>取消</Btn>
              </div>
            )}
            {(voiceState === "asr" || voiceState === "thinking") && (
              <p className="flex items-center gap-2 py-3 text-sm text-slate-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#4d6bfe]" />
                {VOICE_HINT[voiceState]}
              </p>
            )}
            {voiceState === "speaking" && (
              <p className="flex items-center gap-2 py-3 text-sm text-slate-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                {VOICE_HINT.speaking}
              </p>
            )}
            {voiceState === "idle" && (replayUrl || needsTap) && (
              <button onClick={() => replayUrl && playUrl(replayUrl)} className="text-xs font-medium text-[#4d6bfe] hover:underline">
                {needsTap ? "▶ 点击播放面试官回答(浏览器拦截了自动播放)" : "▶ 重播上一条回答"}
              </button>
            )}
            <p className="text-xs text-slate-400">{VOICE_HINT[voiceState]}</p>
          </div>
        ) : (
          <div className="glass-dock flex items-end gap-2 rounded-2xl p-2.5">
            <textarea
              rows={2}
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="输入你的回答…(Enter 发送)"
              value={input}
              disabled={done || busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Btn onClick={send} disabled={done || busy || !input.trim()} className="mb-0.5">{busy ? "面试官思考中…" : "发送"}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
