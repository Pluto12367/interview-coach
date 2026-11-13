import { createMaterial } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";
import type { MaterialType } from "@/lib/types";

interface ImportItem {
  type: MaterialType;
  title: string;
  situation?: string | null;
  task?: string | null;
  action?: string | null;
  result?: string | null;
  metrics?: string[];
  keywords?: string[];
}

/** 批量导入抽取结果(入库即 verified=1:用户已在预览中确认) */
export async function POST(req: Request) {
  return handle(async () => {
    const { items } = await readJson<{ items: ImportItem[] }>(req);
    if (!Array.isArray(items) || items.length === 0) return bad("没有可导入的素材");
    if (items.length > 30) return bad("一次最多导入 30 条");
    const created = items
      .filter((it) => it.title?.trim())
      .map((it) =>
        createMaterial({
          type: it.type,
          title: it.title.trim(),
          situation: it.situation ?? null,
          task: it.task ?? null,
          action: it.action ?? null,
          result: it.result ?? null,
          metrics: Array.isArray(it.metrics) ? it.metrics : [],
          keywords: Array.isArray(it.keywords) ? it.keywords : [],
          source: "extract",
          verified: 1,
        })
      );
    return ok({ imported: created.length, materials: created });
  });
}
