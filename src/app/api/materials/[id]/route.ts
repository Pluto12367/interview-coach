import { deleteMaterial, updateMaterial } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";
import type { MaterialInput } from "@/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const patch = await readJson<Partial<MaterialInput> & { verified?: 0 | 1 }>(req);
    const material = updateMaterial(Number(id), patch);
    if (!material) return bad("素材不存在", 404);
    return ok(material);
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    deleteMaterial(Number(id));
    return ok({ deleted: true });
  });
}
