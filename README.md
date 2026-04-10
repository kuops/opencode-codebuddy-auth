# opencode-codebuddy-auth

OpenCode 插件，用于 CodeBuddy (IOA) 认证。通过浏览器 OAuth 登录后，可在 OpenCode CLI 中使用 CodeBuddy 的对话模型。

## 安装

在 `opencode.json` 中添加：

```json
{
  "plugin": ["opencode-codebuddy-auth"],
  "provider": {
    "codebuddy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CodeBuddy",
      "options": {
        "baseURL": "https://www.codebuddy.cn/v2",
        "setCacheKey": true
      },
      "models": {
        "auto":                    { "name": "Auto", "contextLength": 168000 },
        "minimax-m2.5":            { "name": "MiniMax-M2.5", "contextLength": 200000 },
        "glm-5v-turbo":            { "name": "GLM-5v-Turbo", "contextLength": 200000 },
        "glm-5.1":                 { "name": "GLM-5.1", "contextLength": 200000 },
        "glm-5.0-turbo":           { "name": "GLM-5.0-Turbo", "contextLength": 200000 },
        "glm-5.0":                 { "name": "GLM-5.0", "contextLength": 200000 },
        "glm-4.7":                 { "name": "GLM-4.7", "contextLength": 200000 },
        "glm-4.6v":                { "name": "GLM-4.6V", "contextLength": 128000 },
        "glm-4.6":                 { "name": "GLM-4.6", "contextLength": 168000 },
        "kimi-k2.5":               { "name": "Kimi-K2.5", "contextLength": 256000 },
        "kimi-k2-thinking":        { "name": "Kimi-K2-Thinking", "contextLength": 256000 },
        "deepseek-v3-2-volc":      { "name": "DeepSeek-V3.2", "contextLength": 96000 },
        "deepseek-v3-1-volc":      { "name": "DeepSeek-V3-1-Terminus", "contextLength": 96000 },
        "deepseek-v3-1-lkeap":     { "name": "DeepSeek-V3-1", "contextLength": 96000 },
        "deepseek-v3-1":           { "name": "DeepSeek-V3.1", "contextLength": 96000 },
        "deepseek-r1-0528-lkeap":  { "name": "DeepSeek-R1-0528", "contextLength": 96000 },
        "hunyuan-2.0-instruct":    { "name": "Hunyuan-2.0-Instruct", "contextLength": 128000 },
        "hunyuan-chat":            { "name": "Hunyuan-Turbos", "contextLength": 128000 },
        "default-1.1":             { "name": "Claude-3.7-Sonnet", "contextLength": 200000 },
        "default-1.2":             { "name": "Claude-4.0-Sonnet", "contextLength": 200000 }
      }
    }
  }
}
```

## 登录

```bash
opencode auth codebuddy
```

浏览器会打开 IOA 登录页面，完成后 token 自动保存到本地。

## 可用模型

| 模型 ID | 名称 | 上下文长度 | 图片 | 推理 |
|---------|------|-----------|------|------|
| `auto` | Auto | 168K | Yes | - |
| `minimax-m2.5` | MiniMax-M2.5 | 200K | Yes | Yes |
| `glm-5v-turbo` | GLM-5v-Turbo | 200K | Yes | Yes |
| `glm-5.1` | GLM-5.1 | 200K | No | Yes |
| `glm-5.0-turbo` | GLM-5.0-Turbo | 200K | No | Yes |
| `glm-5.0` | GLM-5.0 | 200K | Yes | Yes |
| `glm-4.7` | GLM-4.7 | 200K | Yes | Yes |
| `glm-4.6v` | GLM-4.6V | 128K | Yes | Yes |
| `glm-4.6` | GLM-4.6 | 168K | No | - |
| `kimi-k2.5` | Kimi-K2.5 | 256K | Yes | Yes |
| `kimi-k2-thinking` | Kimi-K2-Thinking | 256K | Yes | Yes |
| `deepseek-v3-2-volc` | DeepSeek-V3.2 | 96K | Yes | Yes |
| `deepseek-v3-1-volc` | DeepSeek-V3-1-Terminus | 96K | No | - |
| `deepseek-v3-1-lkeap` | DeepSeek-V3-1 | 96K | No | - |
| `deepseek-v3-1` | DeepSeek-V3.1 | 96K | No | - |
| `deepseek-r1-0528-lkeap` | DeepSeek-R1-0528 | 96K | No | - |
| `hunyuan-2.0-instruct` | Hunyuan-2.0-Instruct | 128K | Yes | Yes |
| `hunyuan-chat` | Hunyuan-Turbos | 128K | No | - |
| `default-1.1` | Claude-3.7-Sonnet | 200K | Yes | - |
| `default-1.2` | Claude-4.0-Sonnet | 200K | Yes | - |

模型列表来自 `/v3/config` 接口，可能随时更新。

## 动态获取模型列表

```bash
curl -H 'Accept: application/json, text/plain, */*' \
     -H 'X-Requested-With: XMLHttpRequest' \
     -H 'Authorization: Bearer <TOKEN>' \
     -H 'X-User-Id: <USER_ID>' \
     -H 'X-Domain: www.codebuddy.cn' \
     -H 'X-Product: SaaS' \
     -H 'X-IDE-Type: VSCode' \
     -H 'X-IDE-Name: VSCode' \
     -H 'X-IDE-Version: 1.115.0' \
     -H 'X-Product-Version: 4.3.20019762' \
     -H 'X-Request-Trace-Id: <UUID>' \
     -H 'X-Env-ID: production' \
     -H 'User-Agent: VSCode/1.115.0 CodeBuddy/4.3.20019762' \
     'https://www.codebuddy.cn/v3/config'
```

- `data.models` — 所有可用模型
- `data.agents[0].models` — craft agent 可用的模型列表

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `CODEBUDDY_TENANT_ID` | 覆盖 tenant_id（不设置则从 JWT 自动提取） | 否 |
| `CODEBUDDY_ENTERPRISE_ID` | 覆盖 enterprise_id（不设置则从 JWT 自动提取） | 否 |
| `CODEBUDDY_USER_ID` | 覆盖 user_id（不设置则从 JWT 自动提取） | 否 |
| `CODEBUDDY_DEFAULT_MODEL` | 强制使用指定模型 | 否 |

## 内网 vs 外网

本插件默认适配**外网** CodeBuddy 服务（`www.codebuddy.cn`）。

如果 JWT 的 `iss` 字段包含 `copilot.tencent.com`，说明是内网用户，需修改源码中 `CONFIG.serverUrl` 为 `https://copilot.tencent.com`。

## 工作原理

```
OpenCode CLI
  ├─ loader() → 返回 { apiKey, baseURL, fetch }
  │              fetch 拦截所有 /chat/completions 请求
  ├─ 认证流程 → 浏览器 IOA OAuth → 获取 access_token + refresh_token
  └─ 对话流程 → 拦截请求
                附加认证 headers（Authorization, X-Session-ID 等）
                转发到 https://www.codebuddy.cn/v2/chat/completions
                直接透传 OpenAI 兼容 SSE 响应
```

- **自定义 fetch** 拦截所有 `/chat/completions` 请求，绕过 AI SDK 默认认证
- **自动 token 刷新** — 遇到 401/403 时自动刷新 token 后重试
- **无需 SSE 转换** — API 已直接返回标准 OpenAI 格式

## 开发

```bash
npm install
npm run build
```

## 许可证

MIT
