# Agnes Gateway 管理面板

Vue 3 + Vite + Tailwind CSS 4 + shadcn-vue，保留现有 FastAPI 管理接口。

## 开发与构建

```bash
npm install
npm run dev
npm test
npm run build
```

开发服务默认使用 5173 端口，管理 API 代理到 8787。生产构建输出到 `dist/`，
由 FastAPI 在 `/admin/` 托管；构建后刷新页面即可更新界面。

## 组件与主题

- `src/components/ui/`：通过 shadcn-vue 2.8.2 官方 CLI 全量导入的 66 组组件。
  保留原生 TypeScript 源码，业务页面仍使用 JavaScript 和 `<script setup>`。
- `components.json`：组件生成配置，New York / Zinc 主题。
- `src/style.css`：语义色、字体、圆角和公共布局 token。
- `src/components/`：导航、页面标题、筛选器、空状态、错误反馈等业务组件。
- `src/views/`：登录、总览、聊天、对外密钥、上游池、请求日志、图片库、视频库和设置。
- `src/components/MediaPreview.vue`：远程图片预览、按需加载的视频播放器及加载失败状态。
- `src/views/MediaLibrary.vue`：图片库和视频库共用的搜索、分页、详情与删除页面。
- `src/composables/useClipboard.js`：剪贴板操作与反馈。
- `src/composables/useMediaLibrary.js`：媒体库查询、分页和并发请求状态，防止旧请求覆盖新筛选结果。
- `src/views/ChatWorkspace.vue`：模型／密钥选择、模式切换、会话列表和消息输入；聊天路由使用独立的视口高度布局。
- `src/components/ChatHistory.vue`、`ChatMessage.vue`：会话导航、消息及媒体展示。
- `src/components/ChatComposer.vue`、`ComposerSelect.vue`：大圆角半透明输入面板、底部模式／模型／生成参数选择和圆形发送按钮；密钥选择保留在顶部。
- `src/components/ChatReferencePicker.vue`、`ChatReferenceContent.vue`：参考素材弹窗，支持图片库搜索、分页、多选和 HTTP(S) 图片链接；首尾帧各选一张。
- `src/lib/chat-references.js`：参考图片去重、增删、首尾帧替换与 Flash 数量限制；不读取文件或保存媒体内容。
- `src/lib/chat-client.js`：网关请求、增量 SSE 解码、参数验证和有截止时间的可取消视频轮询。
- `src/composables/useChatWorkspace.js`：多轮上下文、异步请求隔离、暂停／恢复视频任务及浏览器本地历史。

按需引用组件，不要在应用入口全量 import：

```js
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
```

页面通过路由懒加载；总览保留 ECharts，并按需注册图表模块。
字体使用本地字体回退，不依赖远程字体服务。

## 维护注意

- TypeScript 固定在兼容 Vue SFC 编译器 API 的 5.9 系列。
- 完整密钥只在复制操作或创建结果中使用；表格默认显示脱敏标识。
- 所有图表与计数来自现有管理 API，不填充虚构数据。
- 上游连通性验证会请求 Agnes API，界面检查时不要随意触发。
- `npm test` 使用现有 Vite/Vue 运行 SSR、媒体库与聊天状态测试；请求协议使用模拟 fetch，不需要新依赖，不启动浏览器。
- 媒体库只请求管理 API；图片从上游链接懒加载，视频打开详情后才加载。不要在界面检查中触发真实生成。
- 聊天页自动读取模型列表，发送消息才调用生成接口；生成请求使用选择的对外密钥，不使用管理令牌冒充网关密钥。
- 会话存储键为 `agnes_chat_history_v1`，只保存白名单字段和媒体链接，不保存完整密钥／Base64。历史仅属于当前浏览器。
- 视频暂停仅停止客户端查询，上游任务可能继续；恢复必须沿用消息记录中的原密钥 ID、视频 ID 和模型，不重新创建任务。
- 参考图入口只在图像／视频模式启用；为视频添加图片会切到参考模式，首尾帧模式则填入选定帧。更改输入区样式不改变网关请求协议。
- `npm run build` 验证生产构建；SSR 测试不代替实际浏览器布局或交互验证。
