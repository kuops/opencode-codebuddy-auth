import type {
  Hooks,
  Plugin,
} from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROVIDER_ID = "codebuddy";

const CONFIG = {
  serverUrl: "https://copilot.tencent.com",
  chatCompletionsPath: "/v2/chat/completions",
  platform: "VSCode",
  appVersion: "4.9.29177644",
  ideName: "VSCode",
  ideType: "VSCode",
  ideVersion: "1.119.0",
  domain: "www.codebuddy.cn",
  product: "SaaS",
  agentIntent: "craft",
  envId: "production",
  tenantId: process.env.CODEBUDDY_TENANT_ID || "",
  enterpriseId: process.env.CODEBUDDY_ENTERPRISE_ID || "",
  userId: process.env.CODEBUDDY_USER_ID || "",
  defaultModel: process.env.CODEBUDDY_DEFAULT_MODEL || "",
};

export interface CodeBuddyEnvironment {
  serverUrl: string;
  domain: string;
}

interface JwtPayload {
  iss?: string;
  tenant_id?: string;
  tenantId?: string;
  enterprise_id?: string;
  enterpriseId?: string;
  ent_id?: string;
  entId?: string;
  user_id?: string;
  userId?: string;
  uid?: string;
  sub?: string;
  realm_access?: { roles?: string[] };
  resource_access?: { account?: { roles?: string[] } };
}

interface AuthStateResponse {
  code: number;
  data?: {
    state: string;
    authUrl?: string;
  };
}

interface TokenPollResponse {
  code: number;
  data?: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  };
}

interface RefreshResponse {
  code: number;
  data?: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  };
}

interface OpenAIRequest {
  model?: string;
  stream?: boolean;
  response_format?: unknown;
  [key: string]: unknown;
}

interface RemoteModelReasoning {
  effort?: string;
  summary?: string;
  supportedEfforts?: string[];
  canDisableThinking?: boolean;
  defaultEffort?: string;
}

interface RemoteModelBadge {
  color?: string | null;
  display?: string | null;
  label?: string | null;
}

interface RemoteModelHover {
  textZh?: string | null;
}

interface RemoteModelPromotion {
  enabled?: boolean;
  modelIds?: string[];
  priority?: number;
  tier?: string;
  badge?: RemoteModelBadge | null;
  hover?: RemoteModelHover | null;
  schedule?: {
    timezone?: string;
    validFrom?: string;
    validUntil?: string;
    daily?: Array<{ start: string; end: string }>;
  };
}

interface RemoteModel {
  id: string;
  name: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  supportsToolCall?: boolean;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
  onlyReasoning?: boolean;
  reasoning?: RemoteModelReasoning;
  credits?: string | null;
  descriptionZh?: string | null;
  badge?: RemoteModelBadge | null;
  hover?: RemoteModelHover | null;
}

interface RemoteConfigResponse {
  code: number;
  data?: {
    agents?: Array<{ name: string; models?: string[] }>;
    models?: RemoteModel[];
    modelPromotions?: RemoteModelPromotion[];
    modelTiers?: RemoteModelPromotion[];
  };
}

const DEFAULT_MODEL: RemoteModel = {
  id: "auto",
  name: "Auto",
  maxInputTokens: 168000,
  maxOutputTokens: 32000,
  supportsToolCall: true,
  supportsImages: true,
  supportsReasoning: true,
  onlyReasoning: true,
  reasoning: { effort: "high", summary: "auto" },
};

export const codebuddyShared = {
  PROVIDER_ID,
  CONFIG,
  resolveModel,
  buildAuthHeaders,
  refreshAccessToken,
  requestAuthState,
  pollForToken,
  normalizeSseResponse,
  fetchRemoteModels,
  formatCredits,
  readV1AuthToken(): string | undefined {
    try {
      const authPath = path.join(
        os.homedir(),
        ".local",
        "share",
        "opencode",
        "auth.json",
      );
      const all = JSON.parse(
        fs.readFileSync(authPath, "utf8"),
      ) as Record<string, { type: string; access?: string }>;
      const auth = all[PROVIDER_ID];
      if (auth?.type === "oauth" && auth.access) return auth.access;
    } catch {}
    return undefined;
  },
};

const DISCOVERY_TIMEOUT_MS = 5000;

let resolvedServerUrl = CONFIG.serverUrl;
let resolvedDomain = CONFIG.domain;

function currentEnvironment(): CodeBuddyEnvironment {
  return { serverUrl: resolvedServerUrl, domain: resolvedDomain };
}

function formatCredits(credits?: string | null): string | undefined {
  if (!credits) return undefined;
  if (credits === "x0.00" || credits === "x0" || credits === "0.00") return "Free";
  return credits;
}

function remoteBadgeLabel(badge?: RemoteModelBadge | null): string | undefined {
  return badge?.label?.trim() || undefined;
}

function remoteHoverText(hover?: RemoteModelHover | null): string | undefined {
  return hover?.textZh?.trim() || undefined;
}

function modelTierBadgeColor(tier?: string): string | undefined {
  if (tier === "standard" || tier === "trial") return "#00B159";
  if (tier === "advanced" || tier === "flagship") return "#C0701F";
  return undefined;
}

function remoteModelToConfig(m: RemoteModel): Record<string, unknown> {
  const creditLabel = formatCredits(m.credits);
  const entry: Record<string, unknown> = {
    name: creditLabel ? `${m.name} (${creditLabel})` : m.name,
  };
  if (m.maxInputTokens || m.maxOutputTokens) {
    entry.limit = { context: m.maxInputTokens ?? 0, output: m.maxOutputTokens ?? 0 };
  }
  if (m.supportsToolCall) entry.tool_call = true;
  if (m.supportsImages) {
    entry.attachment = true;
    entry.modalities = { input: ["text", "image"], output: ["text"] };
  }
  const supportsReasoning =
    m.supportsReasoning ||
    m.onlyReasoning ||
    (m.reasoning?.supportedEfforts?.length ?? 0) > 0;
  if (supportsReasoning) {
    entry.reasoning = true;
    if (m.supportsToolCall) {
      entry.interleaved = { field: "reasoning_content" as const };
    }

    const options: Record<string, unknown> = {};
    const reasoningEffort = m.reasoning?.effort ?? m.reasoning?.defaultEffort;
    if (reasoningEffort) options.reasoningEffort = reasoningEffort;
    if (m.reasoning?.summary) options.reasoning_summary = m.reasoning.summary;
    if (Object.keys(options).length > 0) entry.options = options;
  }
  return entry;
}

function timeToMinutes(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return hour * 60 + minute;
}

function isPromotionActive(promotion: RemoteModelPromotion, now = new Date()): boolean {
  if (promotion.enabled === false) return false;
  const from = promotion.schedule?.validFrom
    ? Date.parse(promotion.schedule.validFrom)
    : undefined;
  const until = promotion.schedule?.validUntil
    ? Date.parse(promotion.schedule.validUntil)
    : undefined;
  if (from !== undefined && !Number.isNaN(from) && now.getTime() < from) return false;
  if (until !== undefined && !Number.isNaN(until) && now.getTime() >= until) return false;

  const daily = promotion.schedule?.daily;
  if (!daily?.length) return true;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: promotion.schedule?.timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    const current = hour * 60 + minute;
    return daily.some((range) => {
      const start = timeToMinutes(range.start);
      const end = timeToMinutes(range.end);
      if (start === undefined || end === undefined) return false;
      if (start === end) return true;
      return start < end
        ? current >= start && current < end
        : current >= start || current < end;
    });
  } catch {
    return false;
  }
}

async function fetchRemoteModels(
  accessToken: string,
  environment = currentEnvironment(),
  signal?: AbortSignal,
): Promise<RemoteModel[]> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Authorization: `Bearer ${accessToken}`,
    "X-Agent-Intent": CONFIG.agentIntent,
    "X-IDE-Type": CONFIG.ideType,
    "X-IDE-Name": CONFIG.ideName,
    "X-IDE-Version": CONFIG.ideVersion,
    "X-Product-Version": CONFIG.appVersion,
    "X-Env-ID": CONFIG.envId,
    "X-Domain": environment.domain,
    "X-Product": CONFIG.product,
    "User-Agent": `${CONFIG.ideName}/${CONFIG.ideVersion} CodeBuddy/${CONFIG.appVersion}`,
  };
  const resp = await fetch(`${environment.serverUrl}/v3/config`, { headers, signal });
  if (!resp.ok) return [];
  const body = (await resp.json()) as RemoteConfigResponse;
  if (body.code !== 0 || !body.data) return [];
  const allModels = body.data.models || [];
  const modelMap = new Map(allModels.map((m) => [m.id, m]));
  const promotionBadges = new Map<string, RemoteModelBadge>();
  const promotionHovers = new Map<string, RemoteModelHover>();
  const modelHighlights = [
    ...(body.data.modelPromotions || []),
    ...(body.data.modelTiers || []).map((tier) => {
      const color = tier.badge?.color || modelTierBadgeColor(tier.tier);
      return tier.badge && color
        ? { ...tier, badge: { ...tier.badge, color } }
        : tier;
    }),
  ];
  for (const promotion of modelHighlights.sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  )) {
    const active = isPromotionActive(promotion);
    for (const modelId of promotion.modelIds || []) {
      if (
        (active || promotion.badge?.display === "always") &&
        remoteBadgeLabel(promotion.badge) &&
        promotion.badge &&
        !promotionBadges.has(modelId)
      ) {
        promotionBadges.set(modelId, promotion.badge);
      }
      if (
        active &&
        remoteHoverText(promotion.hover) &&
        promotion.hover &&
        !promotionHovers.has(modelId)
      ) {
        promotionHovers.set(modelId, promotion.hover);
      }
    }
  }
  const craftAgent = (body.data.agents || []).find((a) => a.name === CONFIG.agentIntent);
  const craftIds = craftAgent?.models || [];
  if (craftIds.length === 0) return [DEFAULT_MODEL];
  return craftIds
    .map((id) => {
      const model = modelMap.get(id);
      if (!model) return model;
      const badge = promotionBadges.get(id);
      const hover = promotionHovers.get(id);
      const resolvedBadge = remoteBadgeLabel(model.badge)
        ? model.badge
        : badge
          ? { ...model.badge, ...badge }
          : model.badge;
      const resolvedHover = remoteHoverText(model.hover)
        ? model.hover
        : hover
          ? { ...model.hover, ...hover }
          : model.hover;
      return {
        ...model,
        ...(resolvedBadge ? { badge: resolvedBadge } : {}),
        ...(resolvedHover ? { hover: resolvedHover } : {}),
      };
    })
    .filter((m): m is RemoteModel => !!m?.supportsToolCall);
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(payload + pad, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function resolveTenantId(accessToken: string): string {
  if (CONFIG.tenantId) return CONFIG.tenantId;
  const p = decodeJwtPayload(accessToken);
  if (!p) return "";
  const iss = p.iss || "";
  const m = iss.match(/realms\/sso-([^/]+)$/);
  return p.tenant_id || p.tenantId || (m?.[1] || "");
}

function resolveEnterpriseId(accessToken: string): string {
  if (CONFIG.enterpriseId) return CONFIG.enterpriseId;
  const p = decodeJwtPayload(accessToken);
  if (!p) return "";
  const roles = p.realm_access?.roles || p.resource_access?.account?.roles;
  if (roles) {
    for (const r of roles) {
      const m = r.match(/group-admin:([A-Za-z0-9-]+)/);
      if (m?.[1]) return m[1];
    }
  }
  return p.enterprise_id || p.enterpriseId || p.ent_id || p.entId || "";
}

function resolveUserId(accessToken: string): string {
  if (CONFIG.userId) return CONFIG.userId;
  const p = decodeJwtPayload(accessToken);
  return p?.user_id || p?.userId || p?.uid || p?.sub || "";
}

function resolveModel(inputModel?: string): string {
  if (CONFIG.defaultModel) return CONFIG.defaultModel;
  return inputModel || "";
}

function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildAuthHeaders(
  accessToken: string,
  modelId?: string,
  environment = currentEnvironment(),
): Record<string, string> {
  const tenantId = resolveTenantId(accessToken);
  const enterpriseId = resolveEnterpriseId(accessToken);
  const userId = resolveUserId(accessToken);
  const conversationId = generateTraceId();
  const messageId = generateTraceId();
  const traceId = generateTraceId();
  const spanId = generateTraceId().slice(0, 16);
  const parentSpanId = generateTraceId().slice(0, 16);

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Authorization: `Bearer ${accessToken}`,
    "X-Request-ID": messageId,
    "X-Conversation-ID": conversationId,
    "X-Conversation-Request-ID": messageId,
    "X-Conversation-Message-ID": messageId,
    "X-Agent-Intent": CONFIG.agentIntent,
    "X-IDE-Type": CONFIG.ideType,
    "X-IDE-Name": CONFIG.ideName,
    "X-IDE-Version": CONFIG.ideVersion,
    "X-Product-Version": CONFIG.appVersion,
    "X-Request-Trace-Id": traceId,
    "X-Env-ID": CONFIG.envId,
    "X-Domain": environment.domain,
    "X-Product": CONFIG.product,
    "User-Agent": `${CONFIG.ideName}/${CONFIG.ideVersion} CodeBuddy/${CONFIG.appVersion}`,
    b3: `${traceId}-${spanId}-1-${parentSpanId}`,
    "X-B3-TraceId": traceId,
    "X-B3-ParentSpanId": parentSpanId,
    "X-B3-SpanId": spanId,
    "X-B3-Sampled": "1",
  };

  if (tenantId) headers["X-Tenant-Id"] = tenantId;
  if (enterpriseId) headers["X-Enterprise-Id"] = enterpriseId;
  if (userId) headers["X-User-Id"] = userId;
  if (modelId) headers["X-Model-ID"] = modelId;

  return headers;
}

function normalizeSseLine(line: string): string {
  const carriageReturn = line.endsWith("\r") ? "\r" : "";
  const content = carriageReturn ? line.slice(0, -1) : line;
  const match = /^(\s*data:\s*)(.+)$/.exec(content);
  if (!match || match[2] === "[DONE]") return line;

  try {
    const data = JSON.parse(match[2]) as Record<string, unknown>;
    if (!Array.isArray(data.choices)) return line;
    let changed = false;
    for (const choice of data.choices) {
      if (!choice || typeof choice !== "object") continue;
      const delta = (choice as Record<string, unknown>).delta;
      if (!delta || typeof delta !== "object" || Array.isArray(delta)) continue;
      const record = delta as Record<string, unknown>;
      if (Array.isArray(record.tool_calls) && record.tool_calls.length === 0) {
        delete record.tool_calls;
        changed = true;
      }
    }
    if (!changed) return line;
    return `${match[1]}${JSON.stringify(data)}${carriageReturn}`;
  } catch {
    return line;
  }
}

function normalizeSseResponse(response: Response): Response {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          controller.enqueue(encoder.encode(`${normalizeSseLine(line)}\n`));
          newline = buffer.indexOf("\n");
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) controller.enqueue(encoder.encode(normalizeSseLine(buffer)));
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

async function requestAuthState(
  environment = currentEnvironment(),
  signal?: AbortSignal,
): Promise<{ state: string; url: string }> {
  const params = new URLSearchParams({ platform: CONFIG.platform, ioa: "1" });
  const response = await fetch(
    `${environment.serverUrl}/v2/plugin/auth/state?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-No-Authorization": "true",
        "X-No-User-Id": "true",
        "X-No-Enterprise-Id": "true",
        "X-No-Department-Info": "true",
      },
      signal,
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth state request failed: ${response.status} - ${text}`);
  }
  const data = (await response.json()) as AuthStateResponse;
  if (data.code !== 0 || !data.data?.state) {
    throw new Error(`Invalid auth state response: ${JSON.stringify(data)}`);
  }
  const loginUrl =
    data.data.authUrl ||
    `${environment.serverUrl}/login?platform=${CONFIG.platform}&state=${data.data.state}&ioa=1`;
  return { state: data.data.state, url: loginUrl };
}

async function pollForToken(
  state: string,
  expiresAt: number,
  signal?: AbortSignal,
  environment = currentEnvironment(),
): Promise<TokenPollResponse["data"] | null> {
  while (Date.now() < expiresAt) {
    if (signal?.aborted) return null;
    await sleep(3000, signal);
    if (signal?.aborted) return null;
    try {
      const response = await fetch(
        `${environment.serverUrl}/v2/plugin/auth/token?state=${state}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-No-Authorization": "true",
            "X-No-User-Id": "true",
            "X-No-Enterprise-Id": "true",
            "X-No-Department-Info": "true",
          },
          signal,
        },
      );
      if (response.ok) {
        const data = (await response.json()) as TokenPollResponse;
        if (data.code === 0 && data.data?.accessToken) return data.data;
      }
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}

async function refreshAccessToken(
  refreshToken: string,
  environment = currentEnvironment(),
  signal?: AbortSignal,
): Promise<RefreshResponse["data"] | null> {
  try {
    const response = await fetch(
      `${environment.serverUrl}/v2/plugin/auth/token/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${refreshToken}`,
        },
        signal,
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as RefreshResponse;
    if (data.code !== 0) return null;
    return data.data || null;
  } catch {
    return null;
  }
}

export const CodeBuddyAuthPlugin: Plugin = async (input) => {
  return {
    async config(config) {
      if (!config.provider) config.provider = {};
      if (!config.provider[PROVIDER_ID]) {
        config.provider[PROVIDER_ID] = {
          npm: "@ai-sdk/openai-compatible",
          name: "CodeBuddy",
          options: {
            baseURL: `${resolvedServerUrl}/v2`,
            setCacheKey: true,
          },
          models: {},
        };
      }
      const provider = config.provider[PROVIDER_ID] as
        | Record<string, unknown>
        | undefined;
      if (!provider) return;
      const opts = (provider.options || {}) as Record<string, unknown>;
      provider.options = opts;
      const configuredBase = typeof opts.baseURL === "string" ? opts.baseURL : undefined;
      if (configuredBase) {
        try {
          const u = new URL(configuredBase);
          resolvedServerUrl = `${u.protocol}//${u.host}`;
          if (resolvedServerUrl.includes("codebuddy.ai")) {
            resolvedDomain = "www.codebuddy.ai";
          }
        } catch {}
      }
      if (!provider.models) {
        provider.models = {};
      }
      const models = provider.models as Record<string, unknown>;

      let discovered: RemoteModel[] = [];
      try {
        const home = os.homedir();
        const authPath = path.join(home, ".local", "share", "opencode", "auth.json");
        const raw = fs.readFileSync(authPath, "utf8");
        const all = JSON.parse(raw) as Record<string, { type: string; access?: string }>;
        const auth = all[PROVIDER_ID];
        if (auth?.type === "oauth" && auth.access) {
          const work = fetchRemoteModels(auth.access);
          discovered = await Promise.race([
            work,
            new Promise<RemoteModel[]>((resolve) =>
              setTimeout(() => resolve([]), DISCOVERY_TIMEOUT_MS),
            ),
          ]);
        }
      } catch {
        // auth not available yet, use fallback
      }

      if (discovered.length === 0) {
        discovered = [DEFAULT_MODEL];
      }

      const tuiModels = Object.fromEntries(
        discovered.map((m) => {
          const descriptionZh = m.descriptionZh?.trim();
          const label = remoteBadgeLabel(m.badge);
          const hoverTextZh = remoteHoverText(m.hover);
          return [
            m.id,
            {
              name: m.name,
              ...(descriptionZh ? { descriptionZh } : {}),
              ...(label
                ? {
                    badge: {
                      label,
                      ...(m.badge?.color ? { color: m.badge.color } : {}),
                    },
                  }
                : {}),
              ...(hoverTextZh ? { hover: { textZh: hoverTextZh } } : {}),
            },
          ];
        }),
      );
      const tui =
        opts.tui && typeof opts.tui === "object" && !Array.isArray(opts.tui)
          ? (opts.tui as Record<string, unknown>)
          : {};
      opts.tui = { ...tui, models: tuiModels };

      for (const m of discovered) {
        if (models[m.id]) continue;
        models[m.id] = remoteModelToConfig(m);
      }
    },
    auth: {
      provider: PROVIDER_ID,
      async loader(getAuth, _provider) {
        return {
          apiKey: "cli-proxy",
          baseURL: resolvedServerUrl,
          async fetch(
            url: RequestInfo | URL,
            init?: RequestInit,
          ): Promise<Response> {
            const urlStr = url.toString();
            if (!urlStr.includes("/chat/completions")) {
              return fetch(url, init);
            }

            const currentAuth = await getAuth();
            if (currentAuth.type !== "oauth" || !currentAuth.access) {
              throw new Error("缺少 access token，请重新登录");
            }

            let accessToken = currentAuth.access;
            const body = init?.body;
            if (!body) {
              return new Response(
                JSON.stringify({ error: "Missing request body" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            const openaiRequest = JSON.parse(
              typeof body === "string"
                ? body
                : await new Response(body).text(),
            ) as OpenAIRequest;

            const resolvedModel = resolveModel(openaiRequest.model);
            if (!resolvedModel) {
              throw new Error(
                "未设置模型，请设置 CODEBUDDY_DEFAULT_MODEL 或在 OpenCode 选择模型",
              );
            }

            const requestBody: OpenAIRequest = {
              ...openaiRequest,
              model: resolvedModel,
              stream: openaiRequest.stream ?? true,
            };
            if (openaiRequest.response_format) {
              requestBody.response_format = openaiRequest.response_format;
            }

            const doRequest = async (token: string) => {
              return fetch(
                `${resolvedServerUrl}${CONFIG.chatCompletionsPath}`,
                {
                  method: "POST",
                  headers: buildAuthHeaders(token, resolvedModel),
                  body: JSON.stringify(requestBody),
                },
              );
            };

            let response = await doRequest(accessToken);

            if (
              (response.status === 401 || response.status === 403) &&
              currentAuth.refresh
            ) {
              console.log("[codebuddy] Token expired, attempting refresh...");
              const refreshed = await refreshAccessToken(currentAuth.refresh);
              if (refreshed?.accessToken) {
                accessToken = refreshed.accessToken;
                const newExpires = refreshed.expiresIn
                  ? Date.now() + refreshed.expiresIn * 1000
                  : Date.now() + 24 * 60 * 60 * 1000;
                await input.client.auth.set({
                  path: { id: PROVIDER_ID },
                  body: {
                    type: "oauth",
                    access: refreshed.accessToken,
                    refresh: refreshed.refreshToken || currentAuth.refresh,
                    expires: newExpires,
                  },
                });
                response = await doRequest(accessToken);
              }
            }

            if (!response.ok) {
              const errorText = await response.text();
              console.error(
                `[codebuddy] API error: ${response.status} - ${errorText}`,
              );
              return new Response(errorText, {
                status: response.status,
                headers: { "Content-Type": "application/json" },
              });
            }

            return normalizeSseResponse(response);
          },
        };
      },
      methods: [
        {
          label: "IOA 登录 (浏览器)",
          type: "oauth",
          async authorize() {
            const authState = await requestAuthState();
            const expiresAt = Date.now() + 10 * 60 * 1000;
            return {
              url: authState.url,
              instructions: "请在浏览器中完成 IOA 登录",
              method: "auto" as const,
              async callback() {
                const tokenData = await pollForToken(
                  authState.state,
                  expiresAt,
                );
                if (!tokenData) return { type: "failed" as const };
                return {
                  type: "success" as const,
                  access: tokenData.accessToken,
                  refresh: tokenData.refreshToken || "",
                  expires: tokenData.expiresIn
                    ? Date.now() + tokenData.expiresIn * 1000
                    : Date.now() + 24 * 60 * 60 * 1000,
                };
              },
            };
          },
        },
      ],
    },
    async "chat.params"(input, output) {
      if (input.model.providerID !== PROVIDER_ID) return;
      output.options.baseURL = resolvedServerUrl;
    },
  } satisfies Hooks;
};
