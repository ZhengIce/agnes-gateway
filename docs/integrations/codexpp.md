> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# Codex++ 集成指南

> Codex++ Agnes 模型配置指南

# Codex++ Agnes 模型配置指南

## 1. 概述

本指南说明如何在 **Codex++** 中配置 Agnes 模型。

配置完成后，你可以直接在 Codex++ 中使用 Agnes 模型进行聊天、代码生成和 Agent 任务，无需登录 GPT 账户。

## 2. 前置条件

<Note>
  在开始之前，请确保你已具备：

  1. 一个 Agnes API Key。
  2. 能够访问 Agnes API 网关的网络连接。
  3. 目标模型名称。
  4. 已下载或准备安装 Codex++。
</Note>

推荐模型：

<span class="field-row"><code>agnes-2.5-flash</code></span>

API Base URL：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

## 3. 下载 Codex++

打开 Codex++ 下载页面：

<span class="field-row"><code>[https://github.com/BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus)</code></span>

你也可以直接打开最新发布页面：

<span class="field-row"><code>[https://github.com/BigPizzaV3/CodexPlusPlus/releases/latest](https://github.com/BigPizzaV3/CodexPlusPlus/releases/latest)</code></span>

下载与你的设备匹配的版本：

| 设备类型 | 下载文件 |
| - | - |
| Windows | windows-x64-setup.exe |
| Intel 芯片 Mac | macos-x64.dmg |
| Apple 芯片 Mac | macos-arm64.dmg |

如果你不确定你的 Mac 使用的是 Intel 芯片还是 Apple 芯片，点击左上角的 Apple 图标并选择 **关于本机**。

## 4. 安装 Codex++

下载后，正常安装 Codex++。

如果你使用 macOS 并看到以下错误：

```text theme={null}
"Codex++" is damaged and can't be opened.
```

打开 **终端** 并运行以下命令：

```bash theme={null}
sudo xattr -rd com.apple.quarantine "/Applications/Codex++.app"
sudo xattr -rd com.apple.quarantine "/Applications/Codex++ 管理工具.app"
```

运行命令后，重新打开 Codex++ 管理工具。

## 5. 打开 Codex++ 管理工具

安装完成后，打开：

```text theme={null}
Codex++ Management Tool
```

在左侧边栏中，点击：

```text theme={null}
Provider Configuration
```

然后点击：

```text theme={null}
Add Provider
```

接下来，按照以下配置填写 Agnes 提供商信息。

## 6. 添加 Agnes 提供商

填写以下字段：

| 字段 | 值 |
| - | - |
| 名称 | Agnes |
| 访问模式 | API Only |
| 测试模型 | agnes-2.5-flash |
| Base URL | [https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1) |
| Key | 输入你的 Agnes API Key |
| 上游协议 | Chat Completions |

配置示例：

```text theme={null}
Name:
Agnes

Access Mode:
API Only

Test Model:
agnes-2.5-flash

Base URL:
https://api.agnes-ai.cn/v1

Key:
Enter your Agnes API Key

Upstream Protocol:
Chat Completions
```

## 7. 配置注意事项

请仔细检查以下内容：

1. **只输入以** **`sk-`** **开头的 API 密钥**。不要包含 `Bearer`。
2. **Base URL 应以** **`/v1`** **结尾**。不要输入 `/chat/completions`。
3. **上游协议必须为** **`Chat Completions`**。
4. 模型名称应为：

<span class="field-row"><code>agnes-2.5-flash</code></span>

5. 完成配置后，点击：

```text theme={null}
Save
```

## 8. 启用 Agnes 提供商

保存配置后，返回提供商列表并选择：

```text theme={null}
Agnes
```

如果你看到以下任一按钮，点击它以启用 Agnes 提供商：

```text theme={null}
Use
```

```text theme={null}
In Use
```

```text theme={null}
Switch to This Provider
```

成功启用后，Agnes 将成为当前活动的提供商。

## 9. 启动 Codex++

返回左侧边栏，点击：

```text theme={null}
Overview
```

然后点击：

```text theme={null}
Start Codex++
```

你也可以点击右上角的按钮：

```text theme={null}
Restart Codex
```

启动后，你可以正常使用 Codex++，请求将通过 Agnes 模型路由。

## 10. 验证配置

打开 Codex++ 并创建一个新会话。

输入一个简单的测试消息，例如：

```text theme={null}
你好，请介绍一下你自己。
```

如果 Codex++ 正常响应，Agnes 模型配置成功。

## 11. 常见问题

### 1. Codex 无法正常响应怎么办？

请检查以下内容：

* 确保你是从 **Codex++** 或 **Codex++ 管理工具** 启动 Codex，而不是打开原始的 Codex。
* 确保 Base URL 为：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

* 确保 Key 只包含以 `sk-` 开头的 API 密钥。
* 确保上游协议为：

```text theme={null}
Chat Completions
```

* 确保模型为：

<span class="field-row"><code>agnes-2.5-flash</code></span>

* 确保保存配置后已启用 Agnes 提供商。

### 2. 我应该如何输入 API Key？

只输入 Agnes API Key 本身，例如：

```text theme={null}
sk-xxxxxxxxxxxxxxxx
```

不要输入：

```text theme={null}
Bearer sk-xxxxxxxxxxxxxxxx
```

### 3. 我应该如何输入 Base URL？

正确：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

错误：

<span class="field-row"><code>[https://api.agnes-ai.cn/v1/chat/completions](https://api.agnes-ai.cn/v1/chat/completions)</code></span>

### 4. 我需要登录 GPT 账户吗？

不需要。

配置完成后，你可以直接使用 Agnes 模型使用 Codex++。

## 12. 推荐配置摘要

<span class="field-kv"><span class="field-key">提供商名称：</span> <code>Agnes</code></span>
<span class="field-kv"><span class="field-key">模式：</span> <code>API Only</code></span>
<span class="field-kv"><span class="field-key">模型：</span> <code>agnes-2.5-flash</code></span>
<span class="field-kv"><span class="field-key">Base URL：</span> <code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>
<span class="field-kv"><span class="field-key">API Key：</span> <code>YOUR\_AGNES\_API\_KEY</code></span>
<span class="field-kv"><span class="field-key">协议：</span> <code>Chat Completions</code></span>

## 13. 完整设置摘要

1. 下载并安装 Codex++。
2. 打开 Codex++ 管理工具。
3. 进入 Provider Configuration。
4. 添加 Agnes 提供商。
5. 输入模型、Base URL、API Key 和上游协议。
6. 保存配置。
7. 启用 Agnes 提供商。
8. 启动或重启 Codex++。
9. 创建新会话以测试 Codex++ 是否正常响应。
10. 配置完成后，你可以在 Codex++ 中使用 Agnes 模型。


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.