import { getJd } from "@/db";
import { bad, handle, ok } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const jd = getJd(Number(id));
    if (!jd) return bad("JD 不存在", 404);
    return ok(jd);
  });
}
