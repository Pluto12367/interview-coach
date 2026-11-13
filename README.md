# 求职陪练 · Interview Coach

> AI 模拟面试官 + 求职教练:简历素材库 → JD 匹配 → 语音/文字模拟面试 → 复盘报告 → 弱点回流——一个**数据飞轮**型求职产品,基于 DeepSeek API 构建。

![License](https://img.shields.io/badge/License-MIT-blue) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![DeepSeek](https://img.shields.io/badge/API-DeepSeek-4D6BFE) ![语音](https://img.shields.io/badge/语音链路-v1-8ea5ff)

> ⚠️ **免责声明**:本项目为个人开发的学习/实践项目,与 DeepSeek 官方无关;DeepSeek 及其商标归其权利方所有。仓库不分发任何壁纸素材(`public/wallpaper.png` 请自备,缺失时自动回退深海蓝渐变背景)。

## 核心理念:数据飞轮

```
简历素材库(OCR/结构化,用户确认后入库)
      ↓
JD 解析 → 匹配矩阵 + 预测题 → 针对性出题
      ↓
模拟面试(追问引擎:锚定式深挖,语音/文字双模式)
      ↓
复盘报告(四维评分 + 逐字证据 + 改写示范)
      ↓
弱点清单回流 → 下场加权出题 + 真题回填 → 越用越准
```

每一圈都让模拟面试更"懂你"——素材库、弱点状态、会话间的记忆,是通用聊天 App 做不到的部分。

## 功能亮点

- **追问引擎(prompt 驱动)**:三态分类(细节充分/空话/卡壳)→ 升级追问决策表(量化→边界→方案对比→原理)→ 代码层硬规则兜底(深度上限、连续卡壳强制推进);防幻觉:面试官只基于素材锚点提问
- **双模式模拟面试**:文字模式 + 半双工语音模式(前端 VAD 静音自动断句,ASR/TTS Provider 可插拔)
- **复盘报告**:四维评分强制拉开差距、逐字引用原话做证据、用你自己的项目事实做改写示范,评分直驱弱点清单与知识卡
- **JD 匹配矩阵**:hard/plus/implicit 三分要求 + 强匹配/证据不足/缺失判定 + 可执行补救建议(免费→付费转化钩子)
- **素材库**:简历文本抽取 → STAR 结构化 → 用户确认入库(绝不编造);面试中说出新细节会提示补充
- **留存引擎**:每日训练简报、真题回填、投递追踪(deadline 提醒)
- **离线可跑**:`DEBUG_AI=mock` 全链路 Mock,无 Key 跑通整个产品闭环(含语音)

## 快速开始

```bash
npm install

# 离线演示(mock,零配置)
npm run dev          # http://localhost:3000

# 接入真实 DeepSeek API
cp .env.example .env # 填 DEEPSEEK_API_KEY,DEBUG_AI=real
npm run build && npm run start

# 端到端冒烟测试(先启动服务)
node scripts/smoke.mjs 3000
```

**语音模式**:面试页点「🎙 语音模式」。Mock Provider 离线可用(演示文本 + 合成提示音);真实 Provider 在 `.env` 配置 `DEEPSEEK_ASR_URL` / `DEEPSEEK_TTS_URL`(字段约定见 `src/lib/ai/voice.ts` 注释,以官方文档为准;备选阿里/火山/声网)。

**自定义壁纸**:放一张 16:9 图到 `public/wallpaper.png` 即可,主题会自动适配(深海蓝玻璃拟态)。

## 目录结构

```
src/
  lib/
    prompts/        # 六个 prompt 模块(产品壁垒所在,调优只改这里)
    engine/         # 出题计划 / 会话状态机 / 报告生成 / JD 分析
    ai/             # AI 与语音 Provider 抽象(Real + Mock)
    types.ts        # 全产品共享类型
  db/index.ts       # node:sqlite(零原生依赖,惰性初始化)
  app/
    api/            # 19 个路由(素材/JD/会话/报告/弱点/真题/投递/简报/语音)
    page.tsx        # 仪表盘
    materials/ jd/ interview/ report/ review/ applications/
scripts/smoke.mjs   # 23 项端到端冒烟测试
docs/prompts.md     # prompt 体系设计文档与调优指南
```

## Roadmap

- [ ] 真实 DeepSeek Key 全链路实测 + 内测 transcript 调优 prompt(few-shot 迭代)
- [ ] 流式输出(SSE):回复流式 + TTS 分句合成,语音首响应 < 2s
- [ ] 简历 PDF/图片直传(OCR API)、JD 链接抓取(Fetch API)
- [ ] 每日简报定时推送(邮件/微信);每日简报 cron 化
- [ ] 用户系统与多用户数据隔离;成本配额与单用户成本记录
- [ ] SQLite → Postgres;Docker 一键部署;CI + 评测集做 prompt 回归
- [ ] 弱点记忆曲线(SRS)自动安排复习;分享评分卡片(裂变)
- [ ] 群面模拟(多 Agent);更多岗位类型(前端/算法/产品)

欢迎 Issue / PR。调 prompt 是本项目最高杠杆的贡献方式——见 [docs/prompts.md](docs/prompts.md)。

## License

[MIT](LICENSE)
