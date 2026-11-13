import { getSession, listMessages } from "@/db";
import { bad, handle, ok } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const session = getSession(Number(id));
    if (!session) return bad("会话不存在", 404);
    return ok({ session, messages: listMessages(session.id) });
  });
}
