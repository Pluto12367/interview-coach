import { createSession, listSessions } from "@/db";
import { buildPlanForSession } from "@/lib/engine/plan";
import { emitOpening } from "@/lib/engine/session-state";
import { bad, handle, ok, readJson } from "@/lib/http";
import type { SessionMode } from "@/lib/types";

export async function GET() {
  return handle(async () => ok(listSessions()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ mode: SessionMode; jdId?: number | null; materialIds?: number[] | null }>(req);
    if (body.mode !== "tech" && body.mode !== "hr") return bad("mode 必须是 tech 或 hr");

    const plan = await buildPlanForSession({
      mode: body.mode,
      jdId: body.jdId ?? null,
      materialIds: body.materialIds ?? null,
    });
    const session = createSession({ mode: body.mode, jdId: body.jdId ?? null, plan });
    emitOpening(session);
    return ok(session);
  });
}
