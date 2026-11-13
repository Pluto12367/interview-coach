import { createMaterial, listMaterials } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";
import type { MaterialInput } from "@/db";
import type { MaterialType } from "@/lib/types";

const TYPES: MaterialType[] = ["project", "internship", "competition", "skill"];

export async function GET() {
  return handle(async () => ok(listMaterials()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<MaterialInput>(req);
    if (!body.title?.trim()) return bad("素材标题不能为空");
    if (!TYPES.includes(body.type)) return bad(`type 必须是 ${TYPES.join("/")}`);
    const material = createMaterial({ ...body, title: body.title.trim() });
    return ok(material);
  });
}
