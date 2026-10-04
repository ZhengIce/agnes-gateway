# Agnes Gateway

基于 Agnes AI 的 OpenAI 兼容 API 搭建的**可对外提供服务的网关**：FastAPI 后端 + Vue 3 管理面板。

核心链路：外部客户端持网关签发的密钥（`ag-` 前缀）访问网关 → 网关鉴权 / 限流 / 计量 → 从内部 Agnes Key 池选 Key 调用上游。

```
客户端（Cherry Studio / Claude CLI / 任意 OpenAI SDK）
        │  Bearer ag-xxxx
        ▼
┌─ agnes-gateway (FastAPI :8787) ──────────────┐
│  对外密钥鉴权 · RPM/配额限流 · 计量入 SQLite   │
│  上游 Key 池轮换 · 429 冷却重试 · 故障转移     │
└──────────────┬───────────────────────────────┘
               │  Bearer sk-xxxx（池内 50 个轮换）
               ▼
        api.agnes-ai.cn
```

## 快速开始

```bash
# 1. 安装依赖
uv sync

# 2. 导入上游密钥（默认读项目根目录 密钥.txt，每行一个 sk-，幂等去重）
uv run python scripts/import_keys.py

# 3. 启动（管理面板 http://127.0.0.1:8787/admin/）
uv run uvicorn app.main:app --host 0.0.0.0 --port 8787

# 4. 登录面板：admin_token 见 config.yaml

# 前端开发模式（可选）
cd frontend && npm install && npm run dev   # http://localhost:5173，代理到 :8787
cd frontend && npm run build                # 生产构建，FastAPI 自动挂载 /admin
```

## Docker 部署

镜像使用多阶段构建：先构建 Vue 管理面板，再以 Python 运行 FastAPI。管理员令牌、上游密钥、SQLite 数据和媒体链接不会打进镜像，而是通过宿主机文件和目录挂载。

```bash
# 首次部署
cp config.example.yaml config.yaml
# 编辑 config.yaml，至少替换 admin_token
docker compose up -d --build

# 查看状态和日志
docker compose ps
docker compose logs -f agnes-gateway
```

管理面板默认地址为 `http://<服务器地址>:8788/admin/`。首次启动后可以在「上游密钥池」页面添加密钥；也可以在启动前准备根目录的 `密钥.txt`，通过临时只读挂载导入：

```bash
docker compose run --rm \
  -v "$PWD/密钥.txt:/app/密钥.txt:ro" \
  agnes-gateway python scripts/import_keys.py
```

生产环境建议在前面配置 Nginx 或其他反向代理并启用 HTTPS，不要直接把 `8788` 暴露到公网。更新代码后重新执行 `docker compose up -d --build`；`data/` 目录需要纳入备份。

## 对外接入

- **OpenAI 兼容客户端**：Base URL `http://<host>:8788/v1`，API Key 用面板签发的 `ag-` 密钥
- **Anthropic 兼容客户端**（Claude CLI / Claude Desktop）：Base URL `http://<host>:8788`，同一把 `ag-` 密钥（`/v1/messages` 原生透传）
- 客户端**永远不需要** Agnes 的 `sk-` 密钥

## API 覆盖（文档支持的全部模式）

| 类别 | 端点 | 覆盖内容 |
|---|---|---|
| 文本 | `POST /v1/chat/completions` | 流式/非流式、工具调用、Thinking（`chat_template_kwargs.enable_thinking`）、多模态 image_url 输入 |
| 文本 | `POST /v1/responses` | 透传（当前上游该端点对任何格式均返回 500，属上游问题，网关行为正确） |
| 文本 | `POST /v1/messages` | Anthropic 格式：流式/非流式、system、thinking.budget_tokens |
| 文本 | `GET /v1/models` | 模型列表 |
| 图像 | `POST /v1/images/generations` | 文生图（size 1K–4K / ratio 8 种 / b64）、图生图、多图合成（`extra_body` 完整透传） |
| 视频 | `POST /v1/videos` | text / keyframe（首尾帧）/ reference（参考图音频）三种模式 |
| 视频 | `GET /v1/videos/{id}?model_name=` | 查询规范化；**自动用创建任务的那把上游 Key 轮询**（上游任务与 Key 绑定） |
| 兜底 | `/v1/*`、`/agnesapi` | 未显式路由的端点原样透传 |

转发原则：**请求体完整透传、不裁剪字段**，上游新增能力无需改网关。

## 两层密钥

| | 对外密钥（`ag-`） | 上游密钥池（`sk-`） |
|---|---|---|
| 谁用 | 发给外部客户端 | 仅网关服务端持有 |
| 管理 | 面板「对外密钥」页签发/启停/配额 | 面板「上游密钥池」页：单个/多行/上传文件添加、分页、批量启停和连通性验证 |
| 限流 | 每 Key 每类别 RPM + 每日 Token 配额 + 累计成本上限（超限返回 429/402） | 暂时统一按 Free 档位计算滑动窗口，取"用量/限额比"最低者轮换；密钥类型控件已隐藏 |
| 容错 | — | 上游 429 → 该 Key 冷却 60s 换 Key 重试；401 → 自动禁用；模型 402/403/404 → 按 `failover` 链转移 |

## 配置（config.yaml）

`admin_token`、监听地址、上游超时（文本 300s / 图像 360s / 视频 120s）、RPM 限制表、故障转移链、计价表（默认官方现价，优惠结束后改刊例价即可）。改完在「设置」页点重载，或 `POST /admin/api/config/reload`。

## 模型列表

- 管理面板「模型列表」展示官方文档目录与 `/v1/models` 返回型号的合集，支持搜索、文本／生图／生视频分类、复制模型 ID 和查看官方文档。
- 显示简介、能力标签、官方价格、刊例价与优惠说明。价格采用 2026-10-05 核对的官方文档快照，与网关的成本估算配置独立；未核实型号不套用其他型号的价格。
- “上游已返回”仅表示当前查询密钥的目录中有该型号，不保证所有密钥有调用权限；文档收录和即将上线的型号单独标注。
- 管理接口 `GET /admin/api/models` 需要管理员鉴权。上游目录缓存 5 分钟，手动刷新至少间隔 10 秒；刷新失败保留已有目录，并显示提示。

## 图片库与视频库

- 管理面板增加「图片库」「视频库」，支持搜索、分页、预览、复制/打开链接和删除记录。
- 图片生成成功时记录 `data[].url`；Base64 输出不保存，也不改写客户端的请求或响应。
- 视频创建时保存提示词等任务信息；客户端通过 `/v1/videos/{id}` 或 `/agnesapi` 查询到 `status: completed` 和顶层 `url` 时入库。网关不会额外发起后台轮询。
- SQLite 只保存 HTTP(S) 链接与模型、提示词、时间、尺寸等元数据，不下载文件，不保存参考图或 Base64。
- 视频按任务 ID 去重，后续查询可更新同一任务的签名链接；图片按链接去重。删除时清除媒体信息并保留去重标记，避免重复查询恢复已删除记录。
- 预览由浏览器直接访问原始媒体链接；上游链接失效后预览可能不可用，库记录仍保留。
- 只记录功能启用后的结果；旧请求日志未保存输出链接，不能回补历史图片。旧视频任务仍保留密钥归属，后续查询到完成链接时可以入库，但缺少原始提示词。
- 管理 API：`GET /admin/api/media?kind=image|video&search=&limit=24&offset=0`、`DELETE /admin/api/media/{id}`，均需要 `X-Admin-Token`。
- 后端启动时自动迁移旧数据库，不删除原有密钥、任务和日志。

## 聊天窗口

- 管理面板「聊天」（`/admin/#/chat`）支持聊天、生图、生视频，以及模型和对外密钥选择。
- 请求复用已有 `/v1` 接口，仍受密钥权限、RPM 和配额限制，计入请求日志。
- 聊天支持多轮上下文、流式回复、停止等待和复制；`+` 可上传图片提问，也可只发送图片。图片使用 `messages[].content` 中的 `image_url` 内容块传递给所选模型，由模型决定是否支持视觉输入。
- 已发送的聊天图片显示在消息中，并在当前页面会话的后续追问中保留；不把生图/视频生成结果或失败问答混入聊天上下文。图片内容只留在内存，不写入浏览器历史；刷新后显示重新上传提示，缺失图片的历史问答不再作为多模态上下文发送。
- 生图支持本地参考图片上传（JPG、PNG、WebP、GIF；最多 5 张，单张 10 MB、合计 20 MB），选图后可预览和移除。图片仅在当前页面内存中保留，发送时作为 Data URI 随生成请求上传；不写入会话历史，切换会话/模式或刷新后需重新选择。生成结果仍只保存链接。
- 输入区底部保留模式、模型与参数摘要。点击参数摘要打开锚定按钮的设置浮窗，选择比例和分辨率；图片比例 `Auto` 使用模型默认比例（请求省略 `ratio`），保留现有 3K 档位。
- 视频生成方式可在底部单独切换，比例、分辨率和时长保留在设置浮窗。首尾帧模式点击首帧／尾帧卡片直接上传本地图片，支持预览、替换、移除和交换；参考图片模式通过 `+` 上传多张图片，文生视频选图后自动切换到参考图片模式。工具栏图片库按钮仍可选择已有图片或 HTTP(S) 链接。
- 视频上传支持 JPG、PNG、WebP、GIF，单张最多 10 MB、每次请求合计最多 20 MB；Flash 参考图片包含链接在内最多 5 张。上传内容仅在页面内存中保留，以 Data URI 随请求发送，不写入会话历史或媒体库，切换会话／生成类型或刷新后需重新上传。Flash 上传首帧已通过实际生成验证；参考图片模式已覆盖前端请求测试，实际接口测试返回 HTTP 503，尚未完成端到端验证。
- 生成结果在会话内预览，并通过已有转发逻辑进入图片库／视频库；仅保存链接，不下载媒体或保存 Base64。
- 会话历史保存在当前浏览器，支持新建、切换、删除；不跨浏览器同步，也不保存完整密钥。清理站点数据会清除会话历史。
- 视频通常每 10 秒查询一次，限流和暂时错误会退避；查询最长 10 分钟。暂停、切换页面或刷新不会取消上游生成，已取得任务 ID 的会话可以继续查询原任务，不重复创建。
- 视频提交阶段先等待任务编号，再开放暂停查询；取得编号前关闭页面可能无法恢复该任务，请勿盲目重复创建。
- 多个标签页同时编辑会话时会检测存储冲突，暂停旧页面的保存，避免用旧历史覆盖新记录；旧页面当前内容仍保留。
- 模型列表来自 `/v1/models`，读取失败时显示内置模型作为回退；是否可用仍由网关和上游校验。测试不会调用真实模型。

## 测试

```bash
uv run pytest          # 密钥池、鉴权、配额、媒体入库、管理 API 与数据库迁移
cd frontend
npm test               # 请求协议、会话状态和 Vue 渲染测试，不启动浏览器或请求真实模型／媒体
npm run build
```

## 已知事项

- 上游 `/v1/responses` 端点当前不可用（直连上游同样 500），已在面板日志中可见，等上游修复后网关无需改动。
- 视频任务的计费按创建时 `seconds × 720P 单价` 估算；当前 Flash 模型限免，成本为 0。
- 首次启动若忘记导入密钥，「上游密钥池」页面会显示为空，添加即可。

## 目录结构

```
app/            后端（config/db/keypool/gateway_keys/proxy/stats/pricing/media/videotasks/routes）
frontend/       Vue3 + Vite 管理面板（构建产物 dist/ 由 FastAPI 挂载 /admin）
scripts/        import_keys.py 密钥导入
docs/           Agnes AI 官方文档本地镜像（24 页）
data/           SQLite（上游密钥、对外密钥、请求日志、媒体链接与视频任务）
```
