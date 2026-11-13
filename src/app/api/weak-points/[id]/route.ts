import { updateWeakPointStatus } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";
import type { WeakPointStatus } from "@/lib/types";

const STATUSES: WeakPointStatus[] = ["open", "drilled", "cleared"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { status } = await readJson<{ status: WeakPointStatus }>(req);
    if (!STATUSES.includes(status)) return bad("status 必须是 open/drilled/cleared");
    const wp = updateWeakPointStatus(Number(id), status);
    if (!wp) return bad("弱点不存在", 404);
    return ok(wp);
  });
}
