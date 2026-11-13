import { getVoice } from "@/lib/ai/voice";
import { bad, handle, readJson } from "@/lib/http";

/** 文本 → 音频。返回原始音频字节(非 JSON 包裹),前端 fetch 后直接播放 */
export async function POST(req: Request) {
  return handle(async () => {
    const { text } = await readJson<{ text: string }>(req);
    if (!text?.trim()) return bad("合成文本不能为空");
    const { mime, bytes } = await getVoice().tts(text.trim());
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "Content-Type": mime, "Cache-Control": "no-store" },
    });
  });
}
