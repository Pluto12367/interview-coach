import { deleteApplication, updateApplication } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";
import type { AppStatus } from "@/lib/types";

const STATUSES: AppStatus[] = ["投递中", "笔试", "面试中", "Offer", "挂了", "无消息"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const patch = await readJson<{ status?: AppStatus; deadline?: string | null; notes?: string | null }>(req);
    if (patch.status && !STATUSES.includes(patch.status)) return bad(`status 必须是 ${STATUSES.join("/")}`);
    const app = updateApplication(Number(id), patch);
    if (!app) return bad("投递记录不存在", 404);
    return ok(app);
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    deleteApplication(Number(id));
    return ok({ deleted: true });
  });
}
