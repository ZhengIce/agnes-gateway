> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude Desktop 集成指南

> Agnes 模型的 Claude Desktop 集成指南

# Agnes 模型的 Claude Desktop 集成指南

## 1. 概述

本指南说明如何通过 CC-Switch 将 Claude Desktop 连接到 Agnes 模型。配置完成后，Claude Desktop 可以通过 CC-Switch 将请求路由到 Agnes AI API 网关，并使用 Agnes 文本模型进行对话或多模态任务。

## 2. 前置条件

在开始之前，请确保你已具备以下条件：

* 已安装 Claude Desktop。
* 已安装 CC-Switch。
* 一个有效的 Agnes AI API Key。
* 能够访问 Agnes AI API 网关的网络环境。
* 你想要使用的模型名称。

本指南基于 **CC-Switch v3.16.1**。

Claude Desktop 下载链接：

[https://claude.com/download](https://claude.com/download)

CC-Switch 下载链接：

[https://github.com/farion1231/cc-switch/releases](https://github.com/farion1231/cc-switch/releases)

## 3. 安装 Claude Desktop

为你的操作系统选择合适的安装程序：

* Windows：`.exe`
* macOS：`.dmg`
* Linux：`AppImage`

安装完成后，打开 Claude Desktop。

## 4. 打开 CC-Switch

启动 CC-Switch，在顶部导航栏中切换到以下选项：

```text theme={null}
Claude Desktop
```

或者：

```text theme={null}
ClaudeCode Desktop
```

此选项用于配置 Claude Desktop 的模型代理。

## 5. 添加新提供商

点击 **Add New Provider**。

选择：

<span class="field-row"><code>Custom Provider</code></span>

这意味着你将使用自定义模型提供商。

## 6. 输入 API Key

在 API Key 字段中输入从 Agnes AI 平台获取的 API Key。

示例：

<span class="field-row"><code>YOUR\_API\_KEY</code></span>

在大多数情况下，你不需要手动添加 `Bearer` 前缀。

## 7. 输入请求 URL

输入以下请求 URL：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

此 URL 用于将 Claude Desktop 请求转发到 Agnes AI API 网关。

## 8. 启用模型映射

启用模型映射功能。

此功能将 Claude Desktop 中的 Claude 模型名称映射到 Agnes 模型。

## 9. 选择 API 格式

对于 API 格式，选择：

```text theme={null}
OpenAI Chat Completions
```

此格式与 Agnes OpenAI 兼容 API 兼容。

## 10. 获取模型列表

点击 **Fetch Model List** 确认 CC-Switch 能够成功连接到 Agnes AI API 网关。

加载模型列表后，选择你要映射的模型。

推荐映射示例：

```text theme={null}
Sonnet  -> agnes-2.5-flash
Opus    -> agnes-2.5-flash
Haiku   -> agnes-2.5-flash
```

## 11. 保存配置

确认 API Key、请求 URL、API 格式和模型映射正确后，点击 **Save**。

保存成功后，提供商列表中将出现 Agnes 配置。

## 12. 启用 CC-Switch 路由

进入 CC-Switch 设置页面，选择：

```text theme={null}
Route
```

启用本地路由开关并打开 Claude 路由。

## 13. 验证配置

打开 Claude Desktop，开始一个测试对话。

如果配置正确，Claude Desktop 应该能够通过 Agnes 模型返回响应。

## 14. 故障排查

### 1. Claude Desktop 无法调用模型

确保 CC-Switch 本地路由已启用并且 Claude 路由已打开。

### 2. 无法获取模型列表

检查 API Base URL 是否正确：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

同时确认 API Key 是有效的。

### 3. 模型映射失败

确保已启用模型映射，并且 Claude 模型已映射到 Agnes 模型。

推荐模型：

<span class="field-row"><code>agnes-2.5-flash</code></span>

### 4. API 请求失败

检查你的网络、防火墙、代理或 VPN 设置。

### 5. 认证失败

确保 API Key 正确，并且你的账户有足够的余额或积分。


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.