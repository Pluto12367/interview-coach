/**
 * VoiceProvider 抽象(半双工语音链路的可替换层)。
 *
 * - MockVoice:完全离线。ASR 返回轮换的演示文本(不代表真实识别),TTS 用代码合成
 *   一段短 WAV——整条语音 UI 链路无需任何 Key 即可跑通。
 * - RealVoice:通过 env 配置真实 ASR/TTS 端点(DeepSeek 独立语音 API 或阿里/火山等)。
 *   ⚠️ 官方独立 ASR/TTS 的请求/响应字段以官方文档为准,当前实现为约定占位:
 *   ASR:POST {DEEPSEEK_ASR_URL},原始音频为 body,Content-Type 为音频 MIME,返回 JSON {text}
 *   TTS:POST {DEEPSEEK_TTS_URL},JSON {text, voice?},返回音频字节
 *
 * 策略:DEBUG_AI=real 且配置了 ASR/TTS URL 才用 Real;否则回退 Mock 并告警——语音 UI 永远可用。
 */

export interface TtsAudio {
  mime: string;
  bytes: Uint8Array;
}

export interface VoiceProvider {
  readonly name: "mock" | "real";
  /** 音频 → 文本 */
  asr(audio: ArrayBuffer, mime: string, slot?: number): Promise<string>;
  /** 文本 → 音频 */
  tts(text: string): Promise<TtsAudio>;
}

// ---------------- Mock ----------------

const MOCK_ASR_ANSWERS = [
  "我在这段经历里主要负责后端整体设计,订单和商品模块都是我写的,用 Spring Boot 加 MySQL。",
  "高峰期大概一天几百单,没有专门压测过,不过上线以后没出过问题。",
  "缓存主要用在热点商品列表,命中率挺高的,具体数字我回头可以查一下。",
  "遇到的最大问题是慢查询,我加了索引,又把分页方案改成了游标分页才解决。",
];

class MockVoice implements VoiceProvider {
  readonly name = "mock" as const;

  async asr(_audio: ArrayBuffer, _mime: string, slot = 0): Promise<string> {
    await new Promise((r) => setTimeout(r, 250)); // 模拟识别延迟
    return MOCK_ASR_ANSWERS[Math.abs(slot) % MOCK_ASR_ANSWERS.length];
  }

  async tts(text: string): Promise<TtsAudio> {
    // 按 16kHz 16bit 单声道合成一段"音量随文本长度变化"的提示音,验证播放链路
    const sampleRate = 16000;
    const seconds = Math.min(1.2 + text.length * 0.02, 4);
    const total = Math.floor(sampleRate * seconds);
    const bytes = new Uint8Array(44 + total * 2);
    const view = new DataView(bytes.buffer);
    // RIFF / WAVE 头(44 字节标准 PCM)
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + total * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, total * 2, true);
    // 音频数据:220Hz 基频 + 缓入缓出包络
    for (let i = 0; i < total; i++) {
      const t = i / sampleRate;
      const fade = Math.min(1, t / 0.08, (seconds - t) / 0.08);
      const amp = 0.25 * fade * (0.7 + 0.3 * Math.sin(t * 3));
      const sample = Math.round(amp * Math.sin(2 * Math.PI * 220 * t) * 32767);
      view.setInt16(44 + i * 2, sample, true);
    }
    await new Promise((r) => setTimeout(r, 150)); // 模拟合成延迟
    return { mime: "audio/wav", bytes };
  }
}

// ---------------- Real(env 驱动占位) ----------------

class RealVoice implements VoiceProvider {
  readonly name = "real" as const;

  async asr(audio: ArrayBuffer, mime: string, _slot?: number): Promise<string> {
    const url = process.env.DEEPSEEK_ASR_URL;
    if (!url) throw new Error("未配置 DEEPSEEK_ASR_URL(字段约定见 lib/ai/voice.ts 注释)");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": mime || "audio/webm",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY ?? ""}`,
      },
      body: audio,
    });
    if (!res.ok) throw new Error(`ASR API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { text?: string };
    if (!data.text) throw new Error("ASR 返回缺少 text 字段(请核对官方文档后调整解析)");
    return data.text;
  }

  async tts(text: string): Promise<TtsAudio> {
    const url = process.env.DEEPSEEK_TTS_URL;
    if (!url) throw new Error("未配置 DEEPSEEK_TTS_URL(字段约定见 lib/ai/voice.ts 注释)");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY ?? ""}`,
      },
      body: JSON.stringify({ text: text.slice(0, 500), voice: process.env.DEEPSEEK_TTS_VOICE || undefined }),
    });
    if (!res.ok) throw new Error(`TTS API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { mime: res.headers.get("content-type") ?? "audio/mpeg", bytes };
  }
}

// ---------------- 单例 ----------------

let warned = false;

export function getVoice(): VoiceProvider {
  const wantReal =
    process.env.DEBUG_AI === "real" && (process.env.DEEPSEEK_ASR_URL || process.env.DEEPSEEK_TTS_URL);
  if (wantReal) return new RealVoice();
  if (process.env.DEBUG_AI === "real" && !warned) {
    warned = true;
    console.warn("[voice] DEBUG_AI=real 但未配置 DEEPSEEK_ASR_URL / DEEPSEEK_TTS_URL,语音链路回退 Mock");
  }
  return new MockVoice();
}
