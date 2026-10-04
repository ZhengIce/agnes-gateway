> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# WorkBuddy 集成指南

> Agnes 模型的 WorkBuddy 集成指南

# Agnes 模型的 WorkBuddy 集成指南

## 1. 概述

本指南说明如何在 WorkBuddy 中配置 Agnes 自定义模型。配置完成后，WorkBuddy 可以直接调用 Agnes 文本模型进行聊天、编码和 Agent 任务。你还可以通过 WorkBuddy Skills 使用 Agnes 图像和视频模型。

## 2. 前置条件

在开始之前，请确保你已具备：

* 已安装 WorkBuddy。
* 一个 Agnes AI API Key。
* 能够访问 Agnes AI API 网关的网络环境。
* 你想要使用的模型名称。

本指南基于 WorkBuddy v4.24.5。

## 3. 获取 Agnes API Key

访问 Agnes AI 平台：

[https://platform.agnes-ai.cn/](https://platform.agnes-ai.cn/)

登录后，进入 API Key 页面，创建一个 API 密钥并复制。

## 4. 打开自定义模型设置

打开 WorkBuddy。

在页面上点击：

```text theme={null}
Auto
```

然后选择：

配置自定义模型

## 5. 选择自定义提供商

滚动到提供商列表底部，选择：

```text theme={null}
Other
```

或者：

```text theme={null}
Custom
```

此选项表示你想要使用自定义的 OpenAI 兼容 API 服务。

## 6. 添加 Agnes 文本模型

点击 **Add Model** 并填写以下参数：

<span class="field-kv"><span class="field-key">提供商：</span> <code>Custom</code></span>
<span class="field-kv"><span class="field-key">API Base URL：</span> <code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>
<span class="field-kv"><span class="field-key">API Key：</span> <code>YOUR\_API\_KEY</code></span>
<span class="field-kv"><span class="field-key">模型名称：</span> <code>agnes-2.5-flash</code></span>

将 `YOUR_API_KEY` 替换为你实际的 API 密钥。

## 7. 保存配置

确认所有信息正确后，点击 **Save**。

保存成功后，你应该在模型列表中看到以下模型：

<span class="field-row"><code>agnes-2.5-flash</code></span>

## 8. 选择模型

在 WorkBuddy 聊天界面中，选择：

<span class="field-row"><code>agnes-2.5-flash</code></span>

模型选择成功后，文本模型配置完成。

## 9. 验证文本模型

开始一个正常的聊天，例如：

```text theme={null}
你好，请介绍一下你自己。
```

如果配置正确，WorkBuddy 应该返回来自 Agnes 模型的响应。

## 10. 配置图像和视频模型

Agnes 图像和视频模型可以通过创建 Skills 在 WorkBuddy 中使用。

你可以在 WorkBuddy 中输入以下提示词，让它自动创建一个 Skill：

```text theme={null}
我想使用 Agnes Image 2.0 模型生成图片和视频。请访问其 API 平台 https://agnes-ai.cn/zh-Hans/docs/overview 并将其打包为一个 Skill。
```

WorkBuddy 将根据 Agnes API 文档生成图像和视频相关的 Skills。

## 11. 使用图像 Skill

创建 Skill 后，打开 Skill 列表并选择图像生成 Skill。

示例 Skill 名称：

<span class="field-row"><code>agnes-image-gen</code></span>

然后输入图像生成提示词。

示例：

```text theme={null}
生成一个赛博朋克城市夜景，霓虹灯光，电影风格，高细节。
```

如果配置正确，WorkBuddy 将调用 Agnes 图像模型并返回生成结果。

## 12. 使用视频 Skill

选择视频生成 Skill。

示例 Skill 名称：

<span class="field-row"><code>agnes-video-gen</code></span>

然后输入视频生成提示词。

示例：

```text theme={null}
生成一个 5 秒的视频，内容是一位亚洲女模特在白色摄影棚中穿着黑色连衣裙。镜头从全身缓慢移动到半身特写，同时她自然转身。
```

如果配置正确，WorkBuddy 将提交视频生成任务并返回任务状态或视频 URL。

## 13. 故障排查

### 1. 文本模型不返回响应

检查 API Base URL 是否正确：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

同时确认你的 API Key 是有效的。

### 2. 模型列表中没有出现 `agnes-2.5-flash`

确保模型名称输入正确：

<span class="field-row"><code>agnes-2.5-flash</code></span>

模型 ID 通常区分大小写。建议直接从平台复制模型名称。

### 3. 图像或视频 Skill 创建失败

确保 WorkBuddy 能够访问 Agnes 文档 URL：

<span class="field-row"><code>[https://agnes-ai.cn/zh-Hans/docs/overview](https://agnes-ai.cn/zh-Hans/docs/overview)</code></span>

同时确认当前模型具备读取文档和创建 Skills 的能力。

### 4. 视频任务完成时间较长

视频生成通常需要一些时间。

请等待任务完成，然后检查返回的视频 URL 或任务状态。

### 5. 认证失败

检查 API Key 是否正确，以及你的账户余额或积分是否充足。


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.