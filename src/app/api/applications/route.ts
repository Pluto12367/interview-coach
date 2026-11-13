import { createApplication, listApplications } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";
import type { AppStatus } from "@/lib/types";

const STATUSES: AppStatus[] = ["投递中", "笔试", "面试中", "Offer", "挂了", "无消息"];

export async function GET() {
  return handle(async () => ok(listApplications()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ company: string; position?: string; status?: AppStatus; deadline?: string | null; notes?: string | null }>(req);
    if (!body.company?.trim()) return bad("公司不能为空");
    if (body.status && !STATUSES.includes(body.status)) return bad(`status 必须是 ${STATUSES.join("/")}`);
    const app = createApplication({
      company: body.company.trim(),
      position: body.position?.trim() || "",
      status: body.status,
      deadline: body.deadline ?? null,
      notes: body.notes ?? null,
    });
    return ok(app);
  });
}
