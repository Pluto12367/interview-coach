/**
 * 端到端冒烟测试:验证飞轮全链路(mock 模式,无需 API Key)
 * 前置:服务已在 localhost:PORT 运行,DEBUG_AI=mock
 * 运行:node scripts/smoke.mjs [port]
 */
const PORT = process.argv[2] || "3000";
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`\n=== 冒烟测试 → ${BASE} ===\n`);

  // 0. 健康检查
  const home = await fetch(BASE);
  check("首页可访问", home.ok);

  // 1. 素材:手动建 2 条 verified
  const m1 = await api("/api/materials", {
    method: "POST",
    body: JSON.stringify({
      type: "project",
      title: "校园二手交易平台",
      situation: "校园二手交易信息分散",
      task: "独立完成后端",
      action: "Spring Boot + MySQL,Redis 缓存热点商品",
      result: "上线一个月注册 800+",
      metrics: ["注册用户 800+"],
      keywords: ["Java", "Redis", "MySQL", "缓存"],
      verified: 1,
    }),
  });
  const m2 = await api("/api/materials", {
    method: "POST",
    body: JSON.stringify({
      type: "project",
      title: "订单接口性能优化",
      situation: "高峰期响应慢",
      task: "优化 P99",
      action: "两级缓存 + 慢 SQL 治理",
      result: "P99 从 800ms 降到 120ms",
      metrics: ["P99 800ms→120ms"],
      keywords: ["缓存", "性能优化"],
      verified: 1,
    }),
  });
  check("创建素材 1", m1.status === 200 && m1.body.data?.id > 0);
  check("创建素材 2", m2.status === 200 && m2.body.data?.id > 0);
  const matIds = [m1.body.data.id, m2.body.data.id];

  // 2. 简历抽取(mock)→ 批量导入
  const ext = await api("/api/materials/extract", { method: "POST", body: JSON.stringify({ text: "某某,本科,做过 A 项目、B 项目…" }) });
  check("简历抽取(mock)返回素材", ext.status === 200 && Array.isArray(ext.body.data?.materials) && ext.body.data.materials.length > 0);
  const imp = await api("/api/materials/import", { method: "POST", body: JSON.stringify({ items: ext.body.data.materials }) });
  check("批量导入素材", imp.status === 200 && imp.body.data?.imported > 0);

  // 3. JD 分析(mock)→ 轮询
  const jd = await api("/api/jd", {
    method: "POST",
    body: JSON.stringify({ company: "示例科技", position: "后端开发(校招)", rawText: "职责:1.负责高并发订单系统 2.使用 Java/Redis/MySQL。要求:熟悉缓存方案,有抗压能力。" }),
  });
  check("提交 JD", jd.status === 200 && jd.body.data?.id > 0);
  let jdReady = false;
  for (let i = 0; i < 20; i++) {
    const g = await api(`/api/jd/${jd.body.data.id}`);
    if (g.body.data?.status === "ready") {
      jdReady = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  check("JD 分析完成(含匹配矩阵)", jdReady, "");

  // 4. 创建技术面会话(指定素材 + JD)
  const sess = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ mode: "tech", jdId: jd.body.data.id, materialIds: matIds }),
  });
  check("创建会话(出题计划)", sess.status === 200 && sess.body.data?.plan?.threads?.length >= 4, `threads=${sess.body.data?.plan?.threads?.length}`);
  check("开场白已生成", sess.body.data && true); // 开场白通过后续 GET 验证
  const sid = sess.body.data.id;
  const detail = await api(`/api/sessions/${sid}`);
  check("会话详情含面试官开场白", detail.body.data?.messages?.[0]?.role === "interviewer" && detail.body.data.messages.length === 1);
  check("首环节为 intro", detail.body.data?.session?.plan?.threads?.[0]?.type === "intro");

  // 5. 推进对话直到自然结束(mock 引擎:每环节 3 轮 → move_on 推进)
  let turnCount = 0;
  let ended = false;
  let phase = "";
  let lastAction = "";
  for (let i = 0; i < 60; i++) {
    const answer =
      phase === "closing"
        ? "没有了,谢谢面试官。"
        : turnCount % 2 === 0
          ? "我负责了后端整体设计,把热点数据放了缓存,高峰期也没问题。"
          : "大概 QPS 一百多吧,没具体测过。";
    const t = await api(`/api/sessions/${sid}/turn`, {
      method: "POST",
      body: JSON.stringify({ text: answer }),
    });
    if (t.status !== 200) {
      check("对话推进", false, `第 ${i} 轮失败: ${t.body.error}`);
      break;
    }
    turnCount++;
    ended = t.body.data.ended === true;
    phase = t.body.data.phase;
    lastAction = t.body.data.action;
    if (ended) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  check(`对话自然推进至结束(共 ${turnCount} 轮)`, ended, `lastAction=${lastAction} phase=${phase}`);
  check("经历反问环节", phase === "closing" || lastAction === "end");

  // 6. 报告轮询
  let report = null;
  for (let i = 0; i < 20; i++) {
    const r = await api(`/api/reports/${sid}`);
    if (r.status === 200 && r.body.data?.status === "ready") {
      report = r.body.data.report;
      break;
    }
    await new Promise((r2) => setTimeout(r2, 300));
  }
  check("复盘报告生成", report !== null);
  check("报告含四维评分", report?.dimensions?.length === 4);
  check("报告含弱点(飞轮回流)", report?.newWeakPoints?.length > 0);

  // 7. 弱点清单回流验证
  const wp = await api("/api/weak-points");
  check("弱点清单非空", wp.status === 200 && wp.body.data?.length > 0, `count=${wp.body.data?.length}`);

  // 8. 真题回填 + 投递 + 简报
  const rq = await api("/api/real-questions", { method: "POST", body: JSON.stringify({ company: "示例科技", round: "一面", text: "Redis 持久化 RDB 和 AOF 的区别?" }) });
  check("真题回填", rq.status === 200);
  const app = await api("/api/applications", { method: "POST", body: JSON.stringify({ company: "示例科技", position: "后端", deadline: "2026-11-20" }) });
  check("投递记录", app.status === 200);
  const brief = await api("/api/brief", { method: "POST" });
  check("今日简报生成", brief.status === 200 && brief.body.data?.data?.items?.length > 0);

  // 9. 会话状态终态
  const fin = await api(`/api/sessions/${sid}`);
  check("会话终态 done", fin.body.data?.session?.status === "done", `status=${fin.body.data?.session?.status}`);

  // 10. 语音链路(mock Provider:合成 WAV / 演示 ASR)
  const ttsRes = await fetch(`${BASE}/api/voice/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "你好,请先用两分钟介绍一下自己。" }),
  });
  const ttsBytes = await ttsRes.arrayBuffer();
  check("TTS 返回音频字节", ttsRes.ok && (ttsRes.headers.get("content-type") || "").startsWith("audio/") && ttsBytes.byteLength > 1000, `bytes=${ttsBytes.byteLength}`);
  const asrRes = await fetch(`${BASE}/api/voice/asr?slot=0`, {
    method: "POST",
    headers: { "Content-Type": "audio/webm" },
    body: new Uint8Array(4096),
  });
  const asrBody = await asrRes.json();
  check("ASR 返回演示文本(mock)", asrRes.ok && typeof asrBody.data?.text === "string" && asrBody.data.text.length > 5, JSON.stringify(asrBody).slice(0, 120));

  console.log(`\n=== 结果:${passed} 通过 / ${failed} 失败 ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("冒烟测试异常:", e);
  process.exit(1);
});
