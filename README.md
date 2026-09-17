# opencode-codebuddy-auth

OpenCode 插件，用于 CodeBuddy (IOA) 认证。通过浏览器 OAuth 登录后，可在 OpenCode CLI 中使用 CodeBuddy 的对话模型。支持自动从 `/v3/config` 动态获取可用模型列表，支持国内版和国际版切换。

## 安装

在 `opencode.json` 中添加插件即可，三种配置方式任选其一：

#### 方式一：最简配置（推荐）

只需添加插件，provider 和 models 由插件自动创建和发现：

```jsonc
{
  "plugin": ["opencode-codebuddy-auth"]
}
```

#### 方式二：声明 provider，自动发现 models

手动声明 provider 配置，但无需写 models（由 `config` hook 自动注入）：

```jsonc
{
  "plugin": ["opencode-codebuddy-auth"],
  "provider": {
    "codebuddy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CodeBuddy",
      "options": {
        "baseURL": "https://copilot.tencent.com/v2",
        "setCacheKey": true
      }
    }
  }
}
```

#### 方式三：手动声明 models

完全手动控制模型列表，插件不会覆盖已有条目：

```jsonc
{
  "plugin": ["opencode-codebuddy-auth"],
  "provider": {
    "codebuddy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CodeBuddy",
      "options": {
        "baseURL": "https://copilot.tencent.com/v2",
        "setCacheKey": true
      },
      "models": {
        "auto":                    { "name": "Auto", "contextLength": 168000 },
        "hy4-preview-f":           { "name": "Hy4 preview", "contextLength": 1000000 },
        "hy3":                     { "name": "Hy3", "contextLength": 192000 },
        "hy3-x":                   { "name": "Hy3", "contextLength": 192000 },
        "deepseek-v4.1-flash":     { "name": "Deepseek-V4.1-Flash", "contextLength": 1000000 },
        "deepseek-v4-pro":         { "name": "Deepseek-V4-Pro", "contextLength": 1000000 },
        "glm-5.3":                 { "name": "GLM-5.3", "contextLength": 1000000 },
        "glm-5.3-flash":           { "name": "GLM-5.3-Flash", "contextLength": 1000000 },
        "glm-5.2":                 { "name": "GLM-5.2", "contextLength": 1000000 },
        "glm-5.1":                 { "name": "GLM-5.1", "contextLength": 200000 },
        "glm-5v-turbo":            { "name": "GLM-5v-Turbo", "contextLength": 200000 },
        "kimi-k3-1":               { "name": "Kimi-K3", "contextLength": 1000000 },
        "kimi-k2.7":               { "name": "Kimi-K2.7-Code", "contextLength": 256000 },
        "kimi-k2.6":               { "name": "Kimi-K2.6", "contextLength": 256000 },
        "minimax-m3":              { "name": "MiniMax-M3", "contextLength": 512000 }
      }
    }
  }
}
```

> 插件通过 `config` hook 在启动时动态从 CodeBuddy API (`GET /v3/config`) 获取 craft agent 可用模型，自动注入到 `provider.codebuddy.models`。未登录时 fallback 为 `auto` 默认模型。如需覆盖，可在 `provider.codebuddy.models` 中手动声明，插件不会覆盖已有条目。

### TUI 侧边栏

插件包含独立的 TUI 入口，可在会话右侧栏显示当前 CodeBuddy 模型和活动徽标。模型信息默认展开，点击箭头可收起中文描述；badge 从 `/v3/config` 的 `modelPromotions` 中按有效期和优先级匹配，并使用接口返回的颜色。通过 OpenCode 插件安装命令安装时，`package.json` 中的 TUI 默认配置会由 OpenCode 写入 `tui.json`。

手动配置时，在 `~/.config/opencode/tui.json`（或项目 `.opencode/tui.json`）加入：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-codebuddy-auth"]
}
```

插件本身不会创建或改写 `tui.json`。修改后需要重启 OpenCode。

## 登录

```bash
opencode providers login --provider codebuddy
```

浏览器会打开 IOA 登录页面，完成后 token 自动保存到本地。

## 查看可用模型

```bash
# 非交互式列出
opencode models codebuddy

# 交互式选择（OpenCode 内输入 /model 搜索 codebuddy）
```

IOA 登录后，config hook 会通过 `GET /v3/config` 实时获取 craft agent 可用模型并自动注入。

查看插件最终注入的模型配置：

```bash
opencode debug config | jq '.provider.codebuddy'
```

模型名称会显示接口返回的积分倍率：

- `x0.00` 显示为 `Free`，例如 `Hy3 (Free)`
- 其它值原样显示，例如 `Deepseek-V4-Pro (x0.13)`
- 未返回 `credits` 的模型保持原名称

#### craft agent 支持的模型（来自 /v3/config 接口，可能随时更新）

| 模型 ID | 名称 | 上下文 | 图片 | 推理 |
|---------|------|--------|------|------|
| `auto` | Auto | 168K | Yes | Yes |
| `hy4-preview-f` | Hy4 preview | 1M | Yes | Yes |
| `hy3` | Hy3 | 192K | Yes | Yes |
| `hy3-x` | Hy3 | 192K | Yes | Yes |
| `deepseek-v4.1-flash` | Deepseek-V4.1-Flash | 1M | Yes | Yes |
| `deepseek-v4-pro` | Deepseek-V4-Pro | 1M | Yes | Yes |
| `glm-5.3` | GLM-5.3 | 1M | Yes | Yes |
| `glm-5.3-flash` | GLM-5.3-Flash | 1M | Yes | Yes |
| `glm-5.2` | GLM-5.2 | 1M | Yes | Yes |
| `glm-5.1` | GLM-5.1 | 200K | Yes | Yes |
| `glm-5v-turbo` | GLM-5v-Turbo | 200K | Yes | Yes |
| `kimi-k3-1` | Kimi-K3 | 1M | Yes | Yes |
| `kimi-k2.7` | Kimi-K2.7-Code | 256K | Yes | Yes |
| `kimi-k2.6` | Kimi-K2.6 | 256K | Yes | Yes |
| `minimax-m3` | MiniMax-M3 | 512K | Yes | Yes |

### 推理（Reasoning）支持

插件为支持推理的动态模型注入 `reasoning: true` 和 `interleaved: { field: "reasoning_content" }`。同时将 `/v3/config` 返回的 `reasoning.effort`（新格式回退 `reasoning.defaultEffort`）与 `reasoning.summary` 写入模型 `options`，由 OpenCode 的 `@ai-sdk/openai-compatible` 标准链路生成请求体中的 `reasoning_effort` 和 `reasoning_summary`，不在 fetch 拦截器中改写这两个字段。

CodeBuddy 的 SSE reasoning chunk 会携带空的 `tool_calls: []`。当前 OpenAI-compatible 适配器会把字段存在误判为工具调用开始，导致 reasoning 被拆成多个片段。插件仅删除 `choices[].delta.tool_calls` 的空数组；非空工具调用和其它响应字段保持不变。

#### 命令行调试

使用 JSON 事件流检查 reasoning 是否连续：

```bash
opencode run --model codebuddy/hy3 --format json --thinking '只回答 OK'
```

输出中应包含连续的 `"type":"reasoning"` 事件，随后是 `"type":"text"`。验证真实工具调用：

```bash
opencode run --model codebuddy/hy3 --format json --thinking \
  '读取当前目录的 package.json，只告诉我 version 字段。'
```

输出中应包含 `"type":"tool_use"`，工具完成后继续生成最终文本。

#### 动态获取模型列表

```bash
curl -H 'Accept: application/json, text/plain, */*' \
     -H 'X-Requested-With: XMLHttpRequest' \
     -H 'Authorization: Bearer <TOKEN>' \
     -H 'X-User-Id: <USER_ID>' \
     -H 'X-Domain: www.codebuddy.cn' \
     -H 'X-Product: SaaS' \
     -H 'X-IDE-Type: VSCode' \
     -H 'X-IDE-Name: VSCode' \
     -H 'X-IDE-Version: 1.119.0' \
     -H 'X-Product-Version: 4.9.29177644' \
     -H 'X-Request-Trace-Id: <UUID>' \
     -H 'X-Env-ID: production' \
     -H 'User-Agent: VSCode/1.119.0 CodeBuddy/4.9.29177644' \
     'https://copilot.tencent.com/v3/config'
```

- `data.models` — 所有可用模型的详细信息
- `data.agents[0].models` — craft agent 可用的模型 ID 列表

## 环境变量

通过 shell `export` 设置，普通用户无需配置（JWT 自动提取）：

```bash
# 强制使用指定模型（忽略 OpenCode 模型选择）
export CODEBUDDY_DEFAULT_MODEL=deepseek-v4.1-flash

# 覆盖企业/租户信息（不设置则从 JWT 自动提取）
export CODEBUDDY_TENANT_ID=xxx
export CODEBUDDY_ENTERPRISE_ID=xxx
export CODEBUDDY_USER_ID=xxx

opencode
```

| 变量 | 说明 | 必需 |
|------|------|------|
| `CODEBUDDY_DEFAULT_MODEL` | 强制使用指定模型（不设置则使用 OpenCode 选择的模型） | 否 |
| `CODEBUDDY_TENANT_ID` | 覆盖 tenant_id（不设置则从 JWT 自动提取） | 否 |
| `CODEBUDDY_ENTERPRISE_ID` | 覆盖 enterprise_id（不设置则从 JWT 自动提取） | 否 |
| `CODEBUDDY_USER_ID` | 覆盖 user_id（不设置则从 JWT 自动提取） | 否 |

## 国内版 vs 国际版

默认使用**国内版**。切换国际版只需修改 `baseURL`，插件会自动检测并切换 `X-Domain`：

```jsonc
{
  "plugin": ["opencode-codebuddy-auth"],
  "provider": {
    "codebuddy": {
      "options": {
        "baseURL": "https://www.codebuddy.ai/v2"
      }
    }
  }
}
```

| 环境 | baseURL | X-Domain（自动检测） |
|------|---------|---------|
| 国内版（默认） | `https://copilot.tencent.com/v2` | `www.codebuddy.cn` |
| 国际版 | `https://www.codebuddy.ai/v2` | `www.codebuddy.ai` |

> 插件根据 `baseURL` 自动设置 `X-Domain`：检测到 `codebuddy.ai` 时使用 `www.codebuddy.ai`，否则默认 `www.codebuddy.cn`。

## 工作原理

```
OpenCode CLI
  ├─ config hook → 读取 ~/.local/share/opencode/auth.json 获取 token
  │                 调用 GET /v3/config 动态获取 craft agent 可用模型
  │                 注入到 config.provider.codebuddy.models
  ├─ auth hook → 浏览器 IOA OAuth → 获取 access_token + refresh_token
  ├─ loader() → 返回 { apiKey, baseURL, fetch }
  │              fetch 拦截所有 /chat/completions 请求
  └─ 对话流程 → 拦截请求
                附加认证 headers（Authorization, B3 追踪, X-Model-ID 等）
                转发到 CodeBuddy /v2/chat/completions
                规范化空 tool_calls 后透传 OpenAI 兼容 SSE 响应
```

- **自定义 fetch** 拦截所有 `/chat/completions` 请求，绕过 AI SDK 默认认证
- **自动 token 刷新** — 遇到 401/403 时自动刷新 token 后重试
- **最小 SSE 规范化** — 仅删除 `delta.tool_calls: []`，避免适配器错误拆分 reasoning；非空工具调用和其它字段保持不变

## 开发

```bash
npm install
npm run build
```

### 当前目录本地加载

在项目目录创建 `.opencode/opencode.json`，加载 server 插件：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///root/opencode-codebuddy-auth"]
}
```

创建 `.opencode/tui.json`，加载右侧栏 TUI 插件：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["file:///root/opencode-codebuddy-auth"]
}
```

修改源码后重新构建，并完全退出后重启 OpenCode：

```bash
npm run build
opencode
```

使用 package 根目录而不是单独的 `dist/index.js`，可以同时验证 `package.json` 中的 `./server` 和 `./tui` exports。若直接加载构建文件，则分别使用 `dist/index.js` 和 `dist/tui.js`。

## 许可证

MIT
