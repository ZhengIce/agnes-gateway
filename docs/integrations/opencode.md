> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# Opencode 集成指南

> Agnes 模型的 Opencode 集成指南

***

## 概述

本教程介绍如何在 **OpenCode** 中接入 **Agnes-2.5-Flash** 模型。

配置完成后，你可以在 OpenCode 中直接使用 Agnes 模型进行代码生成、项目分析、代码修改和多轮对话。

<Info>
  本教程基于 OpenCode `1.15.13` 版本整理。
</Info>

***

## 准备工作

开始配置前，请确保你已完成以下准备：

1. 已注册 Agnes AI 账号
2. 已进入 Agnes API Platform
3. 已创建并复制 API Key
4. 当前网络环境可以访问 Agnes API Gateway

| 配置项 | 值 |
| - | - |
| Provider | `Agnes` |
| Base URL | `https://api.agnes-ai.cn/v1` |
| Model | `agnes-2.5-flash` |
| API Key | 使用你在 Agnes Platform 创建的 API Key |

<Warning>
  API Key 只填写密钥本身，不需要填写 `Bearer`。
</Warning>

***

## OpenCode CLI 配置

### 适用场景

适用于通过终端使用 OpenCode CLI 的用户。

如果你已经有 OpenCode 配置文件，只需要在原有配置中新增 `agnes` provider，并将默认模型设置为：

```json theme={null}
"model": "agnes/agnes-2.5-flash"
```

***

## 配置文件示例

打开 OpenCode 配置文件，加入以下配置：

```json theme={null}
{
  "$schema": "https://opencode.ai/config.json",

  "model": "agnes/agnes-2.5-flash",

  "provider": {
    "agnes": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Agnes",
      "options": {
        "baseURL": "https://api.agnes-ai.cn/v1",
        "apiKey": "{env:AGNES_API_KEY}"
      },
      "models": {
        "agnes-2.5-flash": {
          "name": "agnes-2.5-flash"
        }
      }
    }
  }
}
```

<Info>
  如果你已有其他 provider，不要直接覆盖整个配置文件。只需要在 `provider` 下新增 `agnes`，并将 `model` 改为 `agnes/agnes-2.5-flash`。
</Info>

***

## 配置环境变量

在终端中配置 Agnes API Key：

```bash theme={null}
export AGNES_API_KEY="你的 Agnes API Key"
```

如果希望长期生效，可以写入 shell 配置文件：

```bash theme={null}
echo 'export AGNES_API_KEY="你的 Agnes API Key"' >> ~/.bashrc
source ~/.bashrc
```

macOS 或 zsh 用户可以写入：

```bash theme={null}
echo 'export AGNES_API_KEY="你的 Agnes API Key"' >> ~/.zshrc
source ~/.zshrc
```

***

## 验证 CLI 配置

启动 OpenCode 后，输入：

```bash theme={null}
/models
```

如果配置成功，可以看到：

```text theme={null}
Agnes
agnes-2.5-flash
```

选择 `Agnes / agnes-2.5-flash` 后，即可开始使用 Agnes 模型。

***

# OpenCode Desktop 配置

## 适用场景

适用于使用 **OpenCode Desktop** 图形界面的用户。

***

## 配置步骤

<Steps>
  <Step title="打开设置">
    启动 OpenCode Desktop，点击左下角的设置按钮。
  </Step>

  <Step title="选择自定义提供商">
    在提供商列表中找到 **自定义提供商**，点击右侧的 **连接**。
  </Step>

  <Step title="填写提供商信息">
    按照以下内容填写 Agnes 提供商配置。
  </Step>
</Steps>

***

## 提供商配置

| 字段 | 填写内容 |
| - | - |
| 提供商 ID | `agnes` |
| 显示名称 | `Agnes` |
| 基础 URL | `https://api.agnes-ai.cn/v1` |
| API 密钥 | 填写你的 Agnes API Key |
| 模型 ID | `agnes-2.5-flash` |
| 模型显示名称 | `Agnes 2.5 Flash` |

配置示例：

```text theme={null}
提供商 ID：agnes
显示名称：Agnes
基础 URL：https://api.agnes-ai.cn/v1
API 密钥：sk-xxxxxxxx
模型 ID：agnes-2.5-flash
模型显示名称：Agnes 2.5 Flash
```

填写完成后，点击 **提交**。

***

## 验证 Desktop 配置

配置完成后，回到 OpenCode Desktop 主界面。

在模型选择列表中选择：

```text theme={null}
Agnes / agnes-2.5-flash
```

发送测试消息：

```text theme={null}
你好，你是什么模型？
```

如果模型正常回复，说明配置完成。

***

## 常见问题

### 找不到 Agnes 模型

请检查以下配置：

1. Provider ID 是否为 `agnes`
2. Base URL 是否为 `https://api.agnes-ai.cn/v1`
3. Model ID 是否为 `agnes-2.5-flash`
4. API Key 是否填写正确
5. API Key 前面是否误填了 `Bearer`

***

### API Key 报错

请确认 API Key 来自 Agnes Platform，并且复制时没有包含多余空格。

正确示例：

```text theme={null}
sk-xxxxxxxxxxxxxxxx
```

错误示例：

```text theme={null}
Bearer sk-xxxxxxxxxxxxxxxx
```

***

### 请求失败或无法连接

请检查：

1. 当前网络是否可以访问 Agnes API Gateway
2. Base URL 是否只填写到 `/v1`
3. 是否误填成 `/v1/chat/completions`
4. API Key 是否仍然有效

正确 Base URL：

```text theme={null}
https://api.agnes-ai.cn/v1
```

***

## 推荐配置

<span class="field-row"><code>agnes-2.5-flash</code></span>

<span class="field-row"><code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>

<span class="field-row"><code>[https://api.agnes-ai.cn/v1/chat/completions](https://api.agnes-ai.cn/v1/chat/completions)</code></span>

| 场景 | 推荐模型 |
| - | - |
| 日常代码生成 | `agnes-2.5-flash` |
| 项目分析 | `agnes-2.5-flash` |
| 代码修改 | `agnes-2.5-flash` |
| 多轮开发对话 | `agnes-2.5-flash` |

***

## 完整参数速查

| 参数 | 值 |
| - | - |
| Provider Name | `Agnes` |
| Provider ID | `agnes` |
| NPM Provider | `@ai-sdk/openai-compatible` |
| Base URL | `https://api.agnes-ai.cn/v1` |
| API Key Env | `AGNES_API_KEY` |
| Model ID | `agnes-2.5-flash` |
| OpenCode Model Path | `agnes/agnes-2.5-flash` |


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.