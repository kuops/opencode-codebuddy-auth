# OpenCode V2 安装与使用指南

`opencode-codebuddy-auth` 1.1.0 起同时支持 OpenCode V1 和 V2。本页只介绍 OpenCode V2；V1 配置请返回项目 [README](README.md)。

## 安装

V2 与 V1 一样支持三种配置方式。

### 方式一：只声明插件（推荐）

provider 和 models 都由插件自动创建：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-codebuddy-auth"]
}
```

### 方式二：声明 provider，自动发现 models

插件保留手动 provider 配置；当 `models` 为空时，自动注入 `/v3/config` 返回的模型：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-codebuddy-auth"],
  "providers": {
    "codebuddy": {
      "name": "CodeBuddy",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://copilot.tencent.com/v2"
      }
    }
  }
}
```

### 方式三：手动声明 provider + models

和 V1 一样，手动模型会覆盖相同 ID 的动态模型，其他动态模型仍然保留：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-codebuddy-auth"],
  "providers": {
    "codebuddy": {
      "name": "CodeBuddy",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://copilot.tencent.com/v2"
      },
      "models": {
        "auto": {
          "name": "Auto",
          "limit": { "context": 168000, "output": 32000 },
          "capabilities": {
            "tools": true,
            "input": ["text", "image"],
            "output": ["text"]
          },
          "compatibility": {
            "reasoningField": "reasoning_content",
            "supportsPromptCacheKey": true
          }
        }
      }
    }
  }
}
```

三种方式都会注册 CodeBuddy OAuth、动态模型发现和请求拦截。手动模型配置只覆盖相同 ID 的动态模型。

修改配置后需要完全退出并重新启动 OpenCode。

## 登录

```bash
opencode auth login codebuddy
```

选择 `IOA 登录 (浏览器)` 后，OpenCode 会显示登录 URL 并等待浏览器授权。授权凭证由 OpenCode V2 的 integration 系统保存和刷新，不再直接依赖 V1 的 `auth.json`。

## 模型

登录后运行：

```bash
opencode models
```

CodeBuddy 模型以 `codebuddy/` 开头，例如：

```bash
opencode run --model codebuddy/auto '只回答 OK'
```

模型由 CodeBuddy `/v3/config` 动态返回。登录前或模型发现失败时，插件只提供 `codebuddy/auto` 作为兜底模型。

模型名保留 CodeBuddy credits 后缀，例如 `Hy3 (Free)`、`Hy4 preview (x0.29)`。

## TUI

V2 TUI 配置位于全局 `~/.config/opencode/cli.json`，插件会在侧边栏显示 CodeBuddy 模型目录。不要使用 V1 的项目级 `tui.json`。

```jsonc
{
  "plugins": ["opencode-codebuddy-auth"]
}
```

## 国际版

在插件配置中指定 `baseURL`：

```jsonc
{
  "plugins": [
    {
      "package": "opencode-codebuddy-auth",
      "options": {
        "baseURL": "https://www.codebuddy.ai"
      }
    }
  ]
}
```

使用国际版时，插件会自动把 `X-Domain` 切换为 `www.codebuddy.ai`。

## 验证

普通对话：

```bash
opencode run --model codebuddy/auto '只回答 OK'
```

真实工具调用：

```bash
opencode run --model codebuddy/hy3 \
  '读取当前目录的 package.json，只告诉我 version 字段。'
```

第二条命令应执行 read 工具并继续生成最终文本。支持 reasoning 的模型使用 V2 原生 `reasoning_content` compatibility，SSE 中空的 `tool_calls: []` 仍会被最小化清理。

## 从 V1 迁移

| 功能 | OpenCode V1 | OpenCode V2 |
|------|-------------|-------------|
| Server 插件配置 | `plugin` | `plugins` |
| 登录命令 | `opencode providers login --provider codebuddy` | `opencode auth login codebuddy` |
| Provider 配置 | `provider.codebuddy` | `providers.codebuddy`（可选） |
| 插件选项 | `provider.codebuddy.options` | `plugins[].options` |
| TUI 配置 | `tui.json` + `plugin` | 全局 `cli.json` + `plugins` |
| 凭证存储 | `auth.json` | OpenCode V2 integration storage |

首次迁移时建议重新执行 V2 登录。插件会尝试读取现有 V1 access token 以帮助模型发现，但 V2 的自动刷新和账号切换依赖 V2 integration 凭证。

## 排查

### `debug config` 中看不到动态模型

这是 OpenCode V2 的正常行为。`opencode debug config` 只显示从全局和项目配置文件读取到的配置文档，不显示插件通过 `provider.transform` 注入的运行时 provider 和模型，也不会把插件注入结果写回 `opencode.json`。

检查最终生效的 CodeBuddy 模型请运行：

```bash
opencode models
```

简单来说：

- `opencode debug config`：查看用户配置内容及其来源。
- `opencode models`：查看插件动态模型与用户手动模型合并后的最终模型列表。

因此，只声明 `plugins` 时，`debug config` 中没有 `providers.codebuddy` 和模型列表，并不表示插件注入失败。

### 动态模型加载失败

配置或插件更新后先完全退出并重启 OpenCode。如果只有 `codebuddy/auto`：

1. 运行 `opencode auth list` 确认 CodeBuddy 已登录。
2. 重新运行 `opencode auth login codebuddy`。
3. 确认网络可以访问 CodeBuddy `/v3/config`。
4. 完全退出并重新启动 OpenCode，再执行 `opencode models`。

### 冷启动时第一次 `opencode models` 为空

在 OpenCode V2.0.16 中，如果后台服务尚未启动，第一次直接执行 `opencode models` 可能在外部插件完成激活前就返回，因此看不到任何 `codebuddy/*` 模型。`opencode models --standalone` 也可能出现相同行为。

这是 OpenCode `models` 命令的插件启动时序问题，不表示 CodeBuddy 插件加载或模型发现失败。先启动一次 OpenCode，待插件完成加载后再查看模型：

```bash
opencode
# 完全启动后退出，或在另一个终端执行：
opencode models
```

服务运行后再次执行 `opencode models`，应能看到完整的 `codebuddy/*` 模型列表。

### 登录时显示 `Something went wrong`

如果授权 URL 已正常显示，随后出现 `Something went wrong`，但最终仍显示 `Connected to codebuddy`，通常是当前终端环境无法启动系统浏览器。授权轮询和凭证保存不受影响，可直接在可用浏览器中打开终端输出的 URL。服务日志中可能出现：

```text
Executable not found in $PATH: "xdg-open"
```

这是浏览器启动提示，不是 CodeBuddy 登录失败。OpenCode V2.0.16 暂无 `--no-browser` 参数，插件 OAuth 接口也没有关闭浏览器的选项。

如需避免 OpenCode 自动调用系统浏览器，请让登录命令以非 TTY 模式运行，并显式指定 integration 和认证方式：

```bash
opencode auth login codebuddy --method ioa --standalone < /dev/null
```

OpenCode 只在 stdin 和 stdout 都是 TTY 时尝试自动打开浏览器。非 TTY 模式仍会打印授权 URL，并继续等待 CodeBuddy 自动轮询；在浏览器中打开该 URL 完成登录即可。
