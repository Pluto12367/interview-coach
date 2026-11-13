import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError("请求体不是合法 JSON", 400);
  }
}

export class HttpError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** 统一错误处理包装 */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof HttpError) return bad(err.message, err.status);
    console.error("[api]", err);
    return bad(err instanceof Error ? err.message : "服务器内部错误", 500);
  });
}
