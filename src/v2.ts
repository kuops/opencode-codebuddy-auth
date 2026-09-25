import { Plugin, Provider, Model, Credential, Integration } from "@opencode/plugin";
import type { Context } from "@opencode/plugin/promise/plugin";
import type { IntegrationEditor, IntegrationMethodRegistration } from "@opencode/plugin/promise/integration";
import type { SessionHttpRequest, SessionHttpResponse } from "@opencode/plugin/promise/session";

export interface RemoteModelLike {
  id: string;
  name: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  supportsToolCall?: boolean;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
  onlyReasoning?: boolean;
  reasoning?: {
    effort?: string;
    summary?: string;
    defaultEffort?: string;
    supportedEfforts?: string[];
  } | null;
  credits?: string | null;
  descriptionZh?: string | null;
  badge?: { label?: string | null; color?: string | null } | null;
  hover?: { textZh?: string | null } | null;
}

export interface CodeBuddyShared {
  PROVIDER_ID: string;
  CONFIG: {
    serverUrl: string;
    chatCompletionsPath: string;
    domain: string;
    [key: string]: unknown;
  };
  resolveModel(inputModel?: string): string;
  buildAuthHeaders(
    accessToken: string,
    modelId?: string,
    environment?: CodeBuddyEnvironment,
  ): Record<string, string>;
  refreshAccessToken(
    refreshToken: string,
    environment?: CodeBuddyEnvironment,
    signal?: AbortSignal,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  } | null | undefined>;
  requestAuthState(
    environment?: CodeBuddyEnvironment,
    signal?: AbortSignal,
  ): Promise<{ state: string; url: string }>;
  pollForToken(
    state: string,
    expiresAt: number,
    signal?: AbortSignal,
    environment?: CodeBuddyEnvironment,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null | undefined>;
  normalizeSseResponse(response: Response): Response;
  fetchRemoteModels(
    accessToken: string,
    environment?: CodeBuddyEnvironment,
    signal?: AbortSignal,
  ): Promise<RemoteModelLike[]>;
  formatCredits(credits?: string | null): string | undefined;
  readV1AuthToken(): string | undefined;
}

interface CodeBuddyEnvironment {
  serverUrl: string;
  domain: string;
}

type ConnectionInfo = NonNullable<
  Awaited<ReturnType<Context["integration"]["connection"]["active"]>>
>;

const FALLBACK_MODEL: RemoteModelLike = {
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

type V2Model = Omit<ReturnType<typeof Model.Info.default>, "name" | "capabilities" | "limit"> & {
  name: string;
  capabilities: { tools: boolean; input: string[]; output: string[] };
  limit: { context: number; output: number };
  settings?: Record<string, unknown>;
  body?: Record<string, unknown>;
  compatibility?: Model.Compatibility;
};

function toV2Model(m: RemoteModelLike, shared: CodeBuddyShared): V2Model {
  const info = Model.Info.default(
    Provider.ID.make(shared.PROVIDER_ID),
    Model.ID.make(m.id),
  ) as V2Model;
  const creditLabel = shared.formatCredits(m.credits);
  info.name = creditLabel ? `${m.name} (${creditLabel})` : m.name;
  info.limit = {
    context: m.maxInputTokens ?? 168000,
    output: m.maxOutputTokens ?? 32000,
  };
  info.capabilities = {
    tools: m.supportsToolCall !== false,
    input: m.supportsImages ? ["text", "image"] : ["text"],
    output: ["text"],
  };
  const settings: Record<string, unknown> = {};
  const effort = m.reasoning?.effort ?? m.reasoning?.defaultEffort;
  if (effort) settings.reasoningEffort = effort;
  if (m.reasoning?.summary) info.body = { reasoning_summary: m.reasoning.summary };
  const supportsReasoning =
    m.supportsReasoning ||
    m.onlyReasoning ||
    (m.reasoning?.supportedEfforts?.length ?? 0) > 0;
  info.compatibility = {
    ...(supportsReasoning ? { reasoningField: "reasoning_content" } : {}),
    ...(m.onlyReasoning ? { requireReasoning: true } : {}),
    supportsPromptCacheKey: true,
  };
  const badgeLabel = m.badge?.label?.trim();
  const hoverTextZh = m.hover?.textZh?.trim();
  const descriptionZh = m.descriptionZh?.trim();
  if (badgeLabel || hoverTextZh || descriptionZh) {
    const tui: Record<string, unknown> = { name: info.name };
    if (descriptionZh) tui.descriptionZh = descriptionZh;
    if (badgeLabel) {
      tui.badge = {
        label: badgeLabel,
        ...(m.badge?.color ? { color: m.badge.color } : {}),
      };
    }
    if (hoverTextZh) tui.hover = { textZh: hoverTextZh };
    settings.tui = tui;
  }
  if (Object.keys(settings).length > 0) info.settings = settings;
  return info;
}

async function resolveActiveCredential(
  ctx: Context,
  shared: CodeBuddyShared,
): Promise<{ token?: string; connection?: ConnectionInfo; legacy?: boolean }> {
  try {
    const connection = await ctx.integration.connection.active(shared.PROVIDER_ID);
    if (connection) {
      const credential = await ctx.integration.connection.resolve(connection);
      if (credential) {
        if (credential.type === "oauth" && credential.access) {
          return { token: credential.access, connection };
        }
        if (credential.type === "key") return { token: credential.key, connection };
      }
    }
  } catch {}
  const token = shared.readV1AuthToken();
  return token ? { token, legacy: true } : {};
}

function resolveEnvironment(options: Record<string, unknown>): CodeBuddyEnvironment {
  const configured = typeof options.baseURL === "string" ? options.baseURL : undefined;
  if (!configured) {
    return { serverUrl: "https://copilot.tencent.com", domain: "www.codebuddy.cn" };
  }
  try {
    const url = new URL(configured);
    const serverUrl = `${url.protocol}//${url.host}`;
    return {
      serverUrl,
      domain: serverUrl.includes("codebuddy.ai")
        ? "www.codebuddy.ai"
        : "www.codebuddy.cn",
    };
  } catch {
    return { serverUrl: "https://copilot.tencent.com", domain: "www.codebuddy.cn" };
  }
}

export function createV2Definition(shared: CodeBuddyShared) {
  const providerID = Provider.ID.make(shared.PROVIDER_ID);

  return Plugin.define({
    id: "codebuddy-auth",
    async setup(ctx) {
      let environment = resolveEnvironment(ctx.options as Record<string, unknown>);
      const registrations: Array<{ dispose(): Promise<void> }> = [];

      const source: {
        models: V2Model[];
        connection?: ConnectionInfo;
        legacy: boolean;
      } = {
        models: [],
        legacy: !!shared.readV1AuthToken(),
      };

      // 1. OAuth integration (IOA browser login + refresh)
      registrations.push(await ctx.integration.transform((editor: IntegrationEditor) => {
        const registration: IntegrationMethodRegistration = {
          integrationID: shared.PROVIDER_ID,
          method: {
            id: "ioa",
            type: "oauth",
            label: "IOA 登录 (浏览器)",
          },
          async authorize() {
            const expiresAt = Date.now() + 10 * 60 * 1000;
            const signal = AbortSignal.timeout(10 * 60 * 1000);
            const authState = await shared.requestAuthState(environment, signal);
            return {
              url: authState.url,
              instructions: "请在浏览器中完成 IOA 登录",
              expiresAt,
              mode: "auto" as const,
              callback: (async () => {
                const tokenData = await shared.pollForToken(
                  authState.state,
                  expiresAt,
                  signal,
                  environment,
                );
                if (!tokenData) throw new Error("IOA 登录超时或失败");
                return {
                  type: "oauth" as const,
                  methodID: Integration.MethodID.make("ioa"),
                  access: tokenData.accessToken,
                  refresh: tokenData.refreshToken || "",
                  expires: tokenData.expiresIn
                    ? Date.now() + tokenData.expiresIn * 1000
                    : Date.now() + 24 * 60 * 60 * 1000,
                } satisfies Credential.OAuth;
              })(),
            };
          },
          async refresh(credential: Credential.OAuth) {
            const refreshed = await shared.refreshAccessToken(
              credential.refresh,
              environment,
              AbortSignal.timeout(15_000),
            );
            if (!refreshed?.accessToken) {
              throw new Error("Token 刷新失败，请重新登录");
            }
            return {
              type: "oauth" as const,
              methodID: credential.methodID as Credential.OAuth["methodID"],
              access: refreshed.accessToken,
              refresh: refreshed.refreshToken || credential.refresh,
              expires: refreshed.expiresIn
                ? Date.now() + refreshed.expiresIn * 1000
                : Date.now() + 24 * 60 * 60 * 1000,
            } satisfies Credential.OAuth;
          },
        };
        editor.method.update(registration);
      }));

      // 2. Provider + dynamic models via /v3/config
      let modelRefresh: Promise<void> | undefined;
      let refreshPending = false;
      const loadModels = () => {
        if (modelRefresh) {
          refreshPending = true;
          return modelRefresh;
        }
        modelRefresh = (async () => {
          do {
            refreshPending = false;
            let remote: RemoteModelLike[] = [];
            try {
              const active = await resolveActiveCredential(ctx, shared);
              source.connection = active.connection;
              source.legacy = active.legacy === true;
              if (active.token) {
                remote = await shared.fetchRemoteModels(
                  active.token,
                  environment,
                  AbortSignal.timeout(5_000),
                );
              }
            } catch {
              if (source.models.length > 0) continue;
            }
            if (remote.length === 0) remote = [FALLBACK_MODEL];
            source.models = remote.map((m) => toV2Model(m, shared));
            await ctx.provider.reload();
          } while (refreshPending);
        })().finally(() => {
          modelRefresh = undefined;
        });
        return modelRefresh;
      };

      registrations.push(await ctx.provider.transform((editor) => {
        const existing = editor.get(shared.PROVIDER_ID);
        if (existing) {
          const configuredBaseURL = existing.provider.settings?.baseURL;
          if (typeof configuredBaseURL === "string") {
            environment = resolveEnvironment({ baseURL: configuredBaseURL });
          }
          editor.update(shared.PROVIDER_ID, (provider) => {
            provider.name ||= "CodeBuddy";
            if (!source.legacy) {
              provider.integrationID = Integration.ID.make(shared.PROVIDER_ID);
            }
          });
          editor.models.set(shared.PROVIDER_ID, source.models);
          return;
        }

        editor.add({
          info: {
            ...Provider.Info.empty(providerID),
            name: "CodeBuddy",
            activation: "enabled",
            ...(source.legacy
              ? {}
              : { integrationID: Integration.ID.make(shared.PROVIDER_ID) }),
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `${environment.serverUrl}/v2` },
          },
          models: source.models,
          ...(source.connection ? { sourceConnection: source.connection } : {}),
        });
      }));

      const eventController = new AbortController();
      const eventTask = (async () => {
        for await (const event of ctx.event.subscribe({ signal: eventController.signal })) {
          if (event.type !== "integration.updated") continue;
          if (event.location && event.location.directory !== ctx.location.directory) continue;
          void loadModels().catch(() => {});
        }
      })().catch(() => {
        // The subscription normally ends by throwing when plugin cleanup aborts it.
      });

      await loadModels();

      // 3. Session hooks: auth headers + endpoint rewrite + SSE normalization
      const scope = { providerID: shared.PROVIDER_ID };

      registrations.push(await ctx.session.hook(
        "http.request",
        async (event: SessionHttpRequest) => {
          const url = new URL(event.request.url);
          if (!url.pathname.includes("/chat/completions")) return;
          const body = await event.request.clone().text();
          if (!body) throw new Error("CodeBuddy request body is empty");
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(body) as Record<string, unknown>;
          } catch {
            throw new Error("CodeBuddy request body is not valid JSON");
          }
          const model = shared.resolveModel(parsed.model as string | undefined);
          if (!model) throw new Error("无法确定 CodeBuddy 模型，请在请求中指定 model");
          const active = await resolveActiveCredential(ctx, shared);
          if (!active.token) throw new Error("缺少 CodeBuddy access token，请重新登录");
          parsed.model = model;
          parsed.stream = parsed.stream ?? true;
          const headers = new Headers(event.request.headers);
          for (const [key, value] of Object.entries(
            shared.buildAuthHeaders(active.token, model, environment),
          )) {
            headers.set(key, value);
          }
          const target = `${environment.serverUrl}${shared.CONFIG.chatCompletionsPath}`;
          event.request = new Request(target, {
            method: event.request.method,
            headers,
            body: JSON.stringify(parsed),
            signal: event.request.signal,
            cache: event.request.cache,
            credentials: event.request.credentials,
            integrity: event.request.integrity,
            keepalive: event.request.keepalive,
            mode: event.request.mode,
            redirect: event.request.redirect,
            referrer: event.request.referrer,
            referrerPolicy: event.request.referrerPolicy,
          });
        },
        scope,
      ));

      registrations.push(await ctx.session.hook(
        "http.response",
        async (event: SessionHttpResponse) => {
          if (!event.request.url.includes("/chat/completions")) return;
          event.response = shared.normalizeSseResponse(event.response);
        },
        scope,
      ));

      return async () => {
        eventController.abort();
        await eventTask;
        await Promise.all(registrations.reverse().map((registration) => registration.dispose()));
      };
    },
  });
}
