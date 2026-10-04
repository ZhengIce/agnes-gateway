> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude CLI 集成指南

> Agnes 模型的 Claude CLI 集成指南

# Agnes 模型的 Claude CLI 集成指南

## 1. 概述

本文档说明如何通过 CC-Switch 将 Claude CLI 连接到 Agnes 模型。

配置完成后，Claude CLI 可以通过 CC-Switch 将请求路由到 Agnes AI API 网关，并使用 Agnes 文本模型进行本地 Agent 任务或编码任务。

## 2. 前置条件

在开始之前，请确保你已具备以下条件：

* 已安装 Claude CLI。
* 已安装 CC-Switch。
* 一个有效的 Agnes AI API Key。
* 能够访问 Agnes AI API 网关的网络环境。
* 你想要使用的目标模型名称。

本指南基于 CC-Switch v3.16.1。

CC-Switch 下载页面：

[https://github.com/farion1231/cc-switch/releases](https://github.com/farion1231/cc-switch/releases)

## 3. 获取 Agnes API Key

访问 Agnes AI 平台：

[https://platform.agnes-ai.cn/](https://platform.agnes-ai.cn/)

登录后，进入 API Key 页面，创建一个 API Key 并复制。

## 4. 打开 CC-Switch

启动 CC-Switch。

在顶部工具栏中，选择：

```text theme={null}
Claude CLI
```

此选项用于配置 Claude CLI 的模型代理。

## 5. 添加新提供商

点击右上角的加号按钮添加新提供商。

对于提供商类型，选择：

```text theme={null}
Claude Provider
```

然后选择：

<span class="field-row"><code>Custom Provider</code></span>

这意味着你将使用自定义模型提供商。

## 6. 输入 API Key

在 API Key 字段中输入从 Agnes AI 平台获取的 API Key。

示例：

<span class="field-row"><code>YOUR\_API\_KEY</code></span>

在大多数情况下，你不需要手动添加 `Bearer` 前缀，除非工具明确要求完整的 Authorization Header。

## 7. 配置请求 URL

输入以下请求 URL：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

此 URL 用于将 Claude CLI 模型请求转发到 Agnes AI API 网关。

## 8. 选择 API 格式

对于 API 格式，选择：

```text theme={null}
OpenAI Chat Completions
```

此格式适用于 OpenAI 兼容的 API 集成。

## 9. 配置认证字段

使用默认认证字段。

如果需要手动配置，可以使用：

```text theme={null}
ANTHROPIC_AUTH_TOKEN
```

## 10. 获取模型列表并配置模型映射

点击 **Fetch Model List** 检查 CC-Switch 是否能够成功连接到 Agnes AI API 网关。

成功获取模型列表后，将 Claude CLI 模型映射到 Agnes 文本模型。

推荐映射：

```text theme={null}
Sonnet  -> agnes-2.5-flash
Opus    -> agnes-2.5-flash
Haiku   -> agnes-2.5-flash
```

你也可以根据实际需求选择其他可用模型。

## 11. 添加自定义参数

为避免模型请求中出现不兼容参数，建议在自定义参数中添加以下配置：

```json theme={null}
{
  "allowed_openai_params": ["thinking", "context_management"],
  "litellm_settings": {
    "drop_params": true
  }
}
```

此配置用于：

* 允许指定的 OpenAI 参数通过。
* 自动丢弃与模型不兼容的未知参数。
* 提高 Claude CLI 通过代理调用 OpenAI 兼容 API 时的兼容性。

## 12. 保存提供商配置

确认 API Key、请求 URL、API 格式、模型映射和自定义参数正确后，点击 **Save** 或 **Add**。

配置保存成功后，提供商列表中将出现 Agnes 配置项。

## 13. 启用 CC-Switch 路由

点击 CC-Switch 左上角的设置按钮，进入路由配置。

选择：

```text theme={null}
Route
```

然后启用：

```text theme={null}
Local Route
```

在本地路由设置中，启用 Claude 路由开关。

## 14. 启用 Agnes 提供商

返回提供商列表。

找到 Agnes Provider 并点击 **Enable**。

启用后，Claude CLI 请求将通过 CC-Switch 转发到 Agnes AI API 网关。

## 15. 验证配置

打开 Claude CLI，运行一个测试对话或编码任务。

如果配置正确，Claude CLI 应该能够正常返回来自 Agnes 模型的响应。

## 16. 故障排查

### 1. 无法获取模型列表

检查 API Base URL 是否正确：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

同时确认 API Key 是有效的。

### 2. 认证失败

检查 API Key 是否输入正确。

在大多数情况下，你只需要输入密钥本身，不需要手动添加 `Bearer` 前缀。

### 3. 请求错误或参数不兼容

确认已添加以下兼容性配置：

```json theme={null}
{
  "allowed_openai_params": ["thinking", "context_management"],
  "litellm_settings": {
    "drop_params": true
  }
}
```

### 4. Claude CLI 没有使用 Agnes 模型

检查是否启用了 CC-Switch 本地路由，并确认 Claude 路由开关已打开。

### 5. 模型响应异常

检查模型映射是否正确。

建议首先使用以下模型：

<span class="field-row"><code>agnes-2.5-flash</code></span>


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.