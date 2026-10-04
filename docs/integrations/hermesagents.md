> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# HermesAgents 集成指南

> HermesAgents 模型配置指南

# HermesAgents 模型配置指南

## 1. 概述

本文档说明如何在 HermesAgents 中配置自定义模型提供商。配置完成后，HermesAgents 将向指定的 API 端点发送模型请求，并使用选定的模型完成 Agent 任务。

## 2. 前置条件

<Note>
  在开始之前，请确保你已具备以下条件：

  1. 你的设备上已安装 HermesAgents。
  2. 一个有效的 API Key。
  3. API 服务端点。
  4. 你想要使用的模型名称。
  5. 一个可用的终端或命令行环境。
</Note>

## 3. 打开终端

在本地设备上打开终端或命令行工具。

macOS 或 Linux 用户可以使用终端（Terminal）。

Windows 用户可以使用命令提示符（Command Prompt）、PowerShell 或开发环境中的终端。

## 4. 配置命令格式

HermesAgents 的配置命令通常遵循以下格式：

```bash theme={null}
hermes config set <configuration_key> <value>
```

请注意，`set` 应放在配置键之前。

## 5. 配置模型提供商

运行以下命令：

```bash theme={null}
hermes config set model.provider custom
```

此命令告诉 HermesAgents 使用自定义模型提供商，而不是默认的内置提供商。

## 6. 配置 API Base URL

运行以下命令：

```bash theme={null}
hermes config set model.base_url https://api.agnes-ai.cn/v1
```

此命令将 HermesAgents 的模型请求端点设置为 Agnes AI API 网关。

通常，API Base URL 只需要以 `/v1` 结尾。你不需要手动添加 `/chat/completions`。

推荐格式：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

通常不推荐：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1/chat/completions](https://api.agnes-ai.cn/v1/chat/completions)</code></span>

只有当 HermesAgents 明确要求完整的端点 URL 时，才使用完整的 API 路径。

## 7. 配置 API Key

运行以下命令：

```bash theme={null}
hermes config set model.api_key YOUR_API_KEY
```

将 `YOUR_API_KEY` 替换为你的实际 API Key。

示例：

```bash theme={null}
hermes config set model.api_key sk-xxxxxxxxxxxxxxxx
```

在大多数情况下，你不需要手动添加 `Bearer` 前缀，除非 HermesAgents 明确要求完整的 Authorization 头。

如果你更喜欢通过环境变量风格的设置来配置 API Key，也可以使用：

```bash theme={null}
hermes config set OPENAI_API_KEY YOUR_API_KEY
```

但是，对于自定义模型提供商设置，建议使用：

```bash theme={null}
hermes config set model.api_key YOUR_API_KEY
```

## 8. 配置模型名称

运行以下命令：

```bash theme={null}
hermes config set model.default agnes-2.5-flash
```

请使用平台提供的完整模型 ID。

模型 ID 通常区分大小写。建议直接从平台复制模型名称。

## 9. 完整配置示例

<span class="field-kv"><span class="field-key">模型提供商：</span> <code>custom</code></span>
<span class="field-kv"><span class="field-key">API Base URL：</span> <code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>
<span class="field-kv"><span class="field-key">API Key：</span> <code>YOUR\_API\_KEY</code></span>
<span class="field-kv"><span class="field-key">模型名称：</span> <code>agnes-2.5-flash</code></span>

## 10. 完整命令示例

```bash theme={null}
hermes config set model.provider custom
hermes config set model.base_url https://api.agnes-ai.cn/v1
hermes config set model.api_key YOUR_API_KEY
hermes config set model.default agnes-2.5-flash
```

## 11. 验证配置

配置完成后，你可以运行一个 HermesAgents 任务或启动一个测试会话。

如果配置正确，HermesAgents 应该能够调用指定的 API 端点并成功返回模型响应。

## 12. 故障排查

### 1. 认证失败

检查你的 API Key 是否有效。

你可以通过运行以下命令重新设置 API Key：

```bash theme={null}
hermes config set model.api_key YOUR_API_KEY
```

同时确保你的账户有足够的余额或积分。

### 2. API 请求失败

检查 API Base URL 是否正确：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

通常，你不需要手动添加 `/chat/completions`。

正确示例：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

通常不推荐：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1/chat/completions](https://api.agnes-ai.cn/v1/chat/completions)</code></span>

只有当 HermesAgents 明确要求完整的端点 URL 时，才使用完整的 API 路径。

### 3. 模型提供商无法识别

确保模型提供商已设置为：

```bash theme={null}
hermes config set model.provider custom
```

### 4. 模型未找到

检查模型名称是否正确。

建议重新运行以下命令：

```bash theme={null}
hermes config set model.default agnes-2.5-flash
```

模型 ID 通常区分大小写。建议直接从平台复制模型名称。

### 5. 网络错误

确保你的设备能够访问 API 端点。

如果请求失败，请检查你的防火墙、代理或 VPN 设置。

## 13. 注意事项

HermesAgents 使用类似于 OpenAI 兼容 API 的配置风格。

对于自定义模型提供商，API Base URL 通常以 `/v1` 结尾。

推荐格式：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

建议通过 `model.api_key` 单独配置 API Key。

模型提供商应设置为：

```text theme={null}
custom
```

这确保 HermesAgents 使用自定义 API 端点而不是默认模型提供商。


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.