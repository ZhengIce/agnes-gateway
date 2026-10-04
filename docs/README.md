# Agnes AI API 文档（本地镜像）

> 来源：https://wiki.agnes-ai.cn/zh-Hans/docs/ （Mintlify 站点，原始 Markdown）
> 抓取时间：2026-10-03 · 共 24 页 · 完整索引：https://wiki.agnes-ai.cn/llms.txt
> 若官方文档更新，可用 `curl -sL <页面URL>.md -o <同名文件>` 重新抓取。

## 快速索引

- **接入基础**：Base URL `https://api.agnes-ai.cn/v1`，认证 `Authorization: Bearer YOUR_API_KEY`
- **核心端点**：文本 `/v1/chat/completions`（兼容 OpenAI）、`/v1/responses`、`/v1/messages`（兼容 Anthropic）；图像 `/v1/images/generations`；视频 `POST /v1/videos` + `GET /agnesapi?video_id=...`（异步轮询）

## 入门

| 文件 | 内容 |
|---|---|
| [overview.md](overview.md) | 产品概述、核心能力、API 兼容性、Base URL 与认证 |
| [quickstart.md](quickstart.md) | 快速开始：创建 Key、配置、curl 请求示例 |

## 模型（models/）

| 文件 | 模型 ID | 类型 |
|---|---|---|
| [agnes-25-flash.md](models/agnes-25-flash.md) | `agnes-2.5-flash` | 文本 |
| [agnes-25-pro.md](models/agnes-25-pro.md) | `agnes-2.5-pro` | 文本（唯一收费模型） |
| [agnes-30-flash.md](models/agnes-30-flash.md) | `agnes-3.0-flash` | 文本（512K 上下文、Thinking、Agent 强化） |
| [agnes-image-20-flash.md](models/agnes-image-20-flash.md) | `agnes-image-2.0-flash` | 图像 |
| [agnes-image-21-flash.md](models/agnes-image-21-flash.md) | `agnes-image-2.1-flash` | 图像 |
| [agnes-image-25-flash.md](models/agnes-image-25-flash.md) | `agnes-image-2.5-flash` | 图像（最新，文生图/图生图/多图合成） |
| [agnes-video-25.md](models/agnes-video-25.md) | `agnes-video-2.5` | 视频（异步任务，text/keyframe/reference 三模式） |
| [agnes-video-25-flash.md](models/agnes-video-25-flash.md) | `agnes-video-2.5-flash` | 视频（Flash 限时免费） |

## 第三方客户端集成（integrations/）

| 文件 | 客户端 |
|---|---|
| [openclaw.md](integrations/openclaw.md) | OpenClaw |
| [hermesagents.md](integrations/hermesagents.md) | HermesAgents |
| [claude-cli.md](integrations/claude-cli.md) | Claude CLI |
| [claude-desktop.md](integrations/claude-desktop.md) | Claude Desktop |
| [workbuddy.md](integrations/workbuddy.md) | WorkBuddy |
| [cherry-studio.md](integrations/cherry-studio.md) | Cherry Studio |
| [opencode.md](integrations/opencode.md) | Opencode |
| [codexpp.md](integrations/codexpp.md) | Codex++ |

## 计划 / 定价 / 参考（reference/）

| 文件 | 内容 |
|---|---|
| [tokenplan.md](reference/tokenplan.md) | 访问计划（免费/企业/Token Plan）、RPM 限制、订阅配额 |
| [pricing.md](reference/pricing.md) | 各模型人民币定价与优惠计费规则 |
| [faqs.md](reference/faqs.md) | 常见问题 |
| [code.md](reference/code.md) | 全部 HTTP 错误码及解决方案 |
| [privacy-policy.md](reference/privacy-policy.md) | 隐私政策 |
| [terms-of-service.md](reference/terms-of-service.md) | 服务条款 |

## 做网关时的高频要点（摘要）

1. 图像 API：`response_format` 必须放在 `extra_body` 内（不能放顶层）；图生图不需要 `tags: ["img2img"]`；生成耗时可达数十秒，客户端超时建议 60–360s。
2. 视频 API：异步任务制，创建后拿 `video_id` 轮询（建议 1–2s 间隔），读 `status`/`progress` 和顶层 `url`，忽略 `internal_*` 字段。
3. RPM 限制：免费文本 10、图像 1K 档 10、视频仅 1；Token Plan 文本 1000。同类型多 Key 共享限额池。429 需重试机制。
4. 尺寸校验：图像尺寸须为 16 的倍数、视频 64 的倍数；不支持的精确尺寸（如 1920×1080）会被自动标准化映射。
5. 计费现状：仅 `agnes-2.5-pro` 收费；其余模型（含视频 Flash）限时免费。
