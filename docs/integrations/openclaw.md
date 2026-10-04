> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# OpenClaw 集成指南

> OpenClaw 模型配置指南

## 1. 概述

本指南说明如何在 OpenClaw 中配置自定义模型提供商。

配置完成后，OpenClaw 可以通过指定的 API 端点调用模型，并将其用于本地 Agent 任务。

## 2. 前置条件

<Note>
  在开始之前，请确保你已具备以下条件：

  1. 你的设备上已安装 OpenClaw。
  2. 一个有效的 API Key。
  3. 你想要使用的模型名称。
  4. 能够正常访问 API 服务的网络环境。
</Note>

<Steps>
  <Step title="打开终端或控制台">
    在本地设备上打开终端或命令行工具。

    macOS 或 Linux 用户可以使用终端（Terminal）。

    Windows 用户可以使用命令提示符（Command Prompt）、PowerShell 或开发环境中的终端。
  </Step>

  <Step title="打开 OpenClaw 配置界面">
    在终端中运行以下命令：

    ```bash theme={null}
    openclaw config
    ```

    按 **Enter** 进入配置流程。
  </Step>

  <Step title="选择本地配置">
    在配置菜单中选择：

    ```text theme={null}
    Local
    ```

    按 **Enter**。

    此选项表示配置将应用于你的本地 OpenClaw 环境。
  </Step>

  <Step title="进入模型配置">
    继续选择：

    ```text theme={null}
    Model
    ```

    按 **Enter**。

    此选项用于配置 OpenClaw 使用的模型服务。
  </Step>

  <Step title="选择自定义提供商">
    选择：

    ```text theme={null}
    Custom Provider
    ```

    按 **Enter**。

    当你想要将 OpenClaw 连接到自定义的 OpenAI 兼容 API 服务时，请选择此选项。
  </Step>

  <Step title="配置 API Base URL">
    当提示输入 API Base URL 时，输入：

    ```text theme={null}
    https://api.agnes-ai.cn/v1
    ```

    按 **Enter**。

    此地址告诉 OpenClaw 将模型请求发送到 Agnes AI API 网关。
  </Step>

  <Step title="输入 API Key">
    当提示输入 API Key 时，输入你的实际 API Key。

    示例：

    ```text theme={null}
    YOUR_API_KEY
    ```

    在大多数情况下，你不需要手动添加 `Bearer` 前缀，除非 OpenClaw 明确要求你输入完整的 Authorization Header。
  </Step>

  <Step title="输入模型名称">
    当提示输入模型名称时，输入你想要使用的模型 ID。

    示例：

    ```text theme={null}
    agnes-2.5-flash
    ```

    请确保输入平台提供的完整模型 ID。
  </Step>

  <Step title="保存配置">
    完成所有必填字段后，确认并保存配置。

    保存成功后，OpenClaw 将使用此自定义提供商进行本地模型调用。
  </Step>
</Steps>

## 12. 配置示例

<span class="field-kv"><span class="field-key">提供商类型：</span> <code>Custom Provider</code></span>
<span class="field-kv"><span class="field-key">API Base URL：</span> <code>[https://api.agnes-ai.cn/v1](https://api.agnes-ai.cn/v1)</code></span>
<span class="field-kv"><span class="field-key">API Key：</span> <code>YOUR\_API\_KEY</code></span>
<span class="field-kv"><span class="field-key">模型：</span> <code>agnes-2.5-flash</code></span>

## 13. 验证配置

配置完成后，你可以运行一个 OpenClaw 任务或启动一个测试会话。

如果配置正确，OpenClaw 应该能够向 API 服务发送请求并正常返回模型响应。

## 14. 故障排查

<AccordionGroup>
  <Accordion title="1. API 请求失败">
    检查 API Base URL 是否正确：

    ```text theme={null}
    https://api.agnes-ai.cn/v1
    ```

    同时确认你的 API Key 是有效的。
  </Accordion>

  <Accordion title="2. 模型未找到">
    检查模型名称是否输入正确。

    模型 ID 通常区分大小写。建议直接从平台复制模型名称。
  </Accordion>

  <Accordion title="3. 认证失败">
    检查 API Key 是否已过期、账户余额是否充足，以及该 Key 是否有权限访问目标模型。
  </Accordion>

  <Accordion title="4. 网络错误">
    确保你的设备能够正常访问 API 地址。

    如果请求无法完成，请检查你的防火墙、代理或 VPN 设置。
  </Accordion>
</AccordionGroup>

## 15. 注意事项

<Warning>
  对于 OpenAI 兼容的 API 服务，API Base URL 通常以 `/v1` 结尾。

  正确示例：

  ```text theme={null}
  https://api.agnes-ai.cn/v1
  ```

  通常不建议输入：

  ```text theme={null}
  https://api.agnes-ai.cn/v1/chat/completions
  ```

  除非 OpenClaw 明确要求你输入完整的 API 端点。
</Warning>


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.