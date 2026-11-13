import { createRealQuestion, listRealQuestions } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";

export async function GET() {
  return handle(async () => ok(listRealQuestions()));
}

/** 真题回填:真实面试中被问到的题(下次出题时会覆盖验证) */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ company: string; round?: string; text: string }>(req);
    if (!body.text?.trim()) return bad("题目内容不能为空");
    if (!body.company?.trim()) return bad("公司不能为空");
    createRealQuestion({ company: body.company.trim(), round: body.round?.trim() || "未注明", text: body.text.trim() });
    return ok({ created: true });
  });
}
