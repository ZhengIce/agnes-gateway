> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# Cherry Studio 集成指南

> Agnes 模型的 Cherry Studio 集成指南

# Agnes 模型的 Cherry Studio 集成指南

## 1. 概述

本文档说明如何在 Cherry Studio 中配置 Agnes 自定义模型。设置完成后，Cherry Studio 可以调用 Agnes 文本模型进行对话。Agnes 图像和视频模型也可以通过 Skills 或绑定到代理来使用。

## 2. 前置条件

在开始之前，请确保你已具备：

* 已安装 Cherry Studio。
* 一个 Agnes AI API Key。
* 能够访问 Agnes AI API 网关的网络环境。
* 你想要使用的模型名称。

## 3. 获取 Agnes API Key

访问 Agnes AI 平台：

[https://platform.agnes-ai.cn/](https://platform.agnes-ai.cn/)

登录后，进入 API Key 页面，创建一个 API Key 并复制。

## 4. 添加提供商

打开 Cherry Studio，进入 API 提供商或模型设置页面。

点击：

```text theme={null}
Add Provider
```

## 5. 选择提供商类型

对于提供商类型，选择：

```text theme={null}
OpenAI
```

或者，选择支持 OpenAI 兼容 API 的自定义提供商类型。

## 6. 输入提供商名称

你可以将提供商名称设置为：

```text theme={null}
Agnes
```

你也可以使用更容易识别的名称，例如：

```text theme={null}
Agnes AI
```

## 7. 输入 API Key

在 API Key 字段中，输入从 Agnes AI 平台获取的 API Key。

示例：

<span class="field-row"><code>YOUR\_API\_KEY</code></span>

在大多数情况下，你不需要手动添加 `Bearer` 前缀。

## 8. 输入 API Base URL

将 API Base URL 设置为：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

通常，你不需要输入完整的 `/chat/completions` 端点。

推荐格式：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

不推荐：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1/chat/completions](https://api.agnes-ai.cn/v1/chat/completions)</code></span>

只有当 Cherry Studio 明确要求时，才使用完整的端点 URL。

## 9. 获取模型列表

点击获取模型列表。

如果 API Key 和 API Base URL 正确，Cherry Studio 应该能够检索到可用的 Agnes 模型。

选择文本模型：

<span class="field-row"><code>agnes-2.5-flash</code></span>

## 10. 保存配置

确认提供商名称、API Key、API Base URL 和模型名称正确后，点击保存。

保存成功后，模型列表中将出现 Agnes 模型。

## 11. 验证文本模型

在 Cherry Studio 中创建一个新聊天，选择：

<span class="field-row"><code>agnes-2.5-flash</code></span>

发送一条测试消息：

```text theme={null}
你好，请介绍一下 Agnes AI。
```

如果配置正确，Cherry Studio 应该返回正常的模型响应。

## 12. 使用图像和视频模型

在 Cherry Studio 中，图像和视频模型建议通过创建 Skills 并绑定到代理来使用。

你可以创建一个 Agnes Image Skill 来调用 Agnes 图像模型。

示例 Skill 名称：

```text theme={null}
Agnes Image Skill
```

你也可以创建一个 Agnes Video Skill 来调用 Agnes 视频模型。

示例 Skill 名称：

```text theme={null}
Agnes Video Skill
```

创建 Skills 后，将它们绑定到一个代理。然后你可以通过对话生成图像或视频。

## 13. 故障排查

### 1. 无法获取模型列表

检查 API Base URL 是否正确：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

同时确认 API Key 是有效的。

### 2. 认证失败

确保 API Key 输入正确，并且账户有足够的余额或积分。

### 3. 模型未找到

确认模型名称正确。

推荐模型：

<span class="field-row"><code>agnes-2.5-flash</code></span>

### 4. 文本模型可以工作，但图像或视频模型不工作

Cherry Studio 的标准 OpenAI 兼容文本模型配置通常仅适用于文本对话。

对于图像和视频模型，建议使用 Skills 或将其绑定为代理工具。

### 5. 请求失败

检查你的网络、防火墙、代理或 VPN 设置。


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.