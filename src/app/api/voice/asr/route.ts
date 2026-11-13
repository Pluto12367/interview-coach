import { getVoice } from "@/lib/ai/voice";
import { bad, handle, ok } from "@/lib/http";

/** 音频 → 文本。body 为原始音频字节,?slot=N 供 Mock 轮换演示文本(真实 Provider 忽略) */
export async function POST(req: Request) {
  return handle(async () => {
    const audio = await req.arrayBuffer();
    if (audio.byteLength === 0) return bad("音频内容为空");
    if (audio.byteLength > 10 * 1024 * 1024) return bad("音频超过 10MB 上限");
    const mime = req.headers.get("content-type") ?? "audio/webm";
    const slot = Number(new URL(req.url).searchParams.get("slot") ?? 0);
    const text = await getVoice().asr(audio, mime, slot);
    return ok({ text, provider: getVoice().name });
  });
}
