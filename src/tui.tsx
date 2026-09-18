/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { RGBA } from "@opentui/core";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";

const PROVIDER_ID = "codebuddy";

interface Badge {
  label: string;
  color?: string;
}

interface Hover {
  textZh: string;
}

interface ModelMetadata {
  descriptionZh?: string;
  badge?: Badge;
  hover?: Hover;
}

interface SelectedModel {
  sessionID: string;
  providerID: string;
  modelID: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseMetadata(value: unknown): ModelMetadata | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const badgeRecord = asRecord(record.badge);
  const label = typeof badgeRecord?.label === "string" ? badgeRecord.label : undefined;
  const badge = label
    ? {
        label,
        color: typeof badgeRecord?.color === "string" ? badgeRecord.color : undefined,
      }
    : undefined;
  const descriptionZh =
    typeof record.descriptionZh === "string" ? record.descriptionZh : undefined;
  const hoverRecord = asRecord(record.hover);
  const hoverTextZh =
    typeof hoverRecord?.textZh === "string" ? hoverRecord.textZh : undefined;
  const hover = hoverTextZh ? { textZh: hoverTextZh } : undefined;
  if (!descriptionZh && !badge && !hover) return undefined;
  return { descriptionZh, badge, hover };
}

function badgeColor(value: string | undefined, fallback: RGBA): RGBA {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  try {
    return RGBA.fromHex(value);
  } catch {
    return fallback;
  }
}

function badgeTextColor(value: string | undefined, fallback: RGBA): RGBA {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return RGBA.fromHex(luminance > 150 ? "#000000" : "#FFFFFF");
}

function ModelInfo(props: { api: TuiPluginApi; sessionID: string }) {
  const theme = () => props.api.theme.current;
  const [selected, setSelected] = createSignal<SelectedModel>();
  const [open, setOpen] = createSignal(true);

  const updateSelected = (model: SelectedModel) => {
    setSelected((current) =>
      current?.sessionID === model.sessionID &&
      current.providerID === model.providerID &&
      current.modelID === model.modelID
        ? current
        : model,
    );
  };

  let initialized = false;
  createEffect(() => {
    if (initialized) return;
    const messages = props.api.state.session.messages(props.sessionID);
    const message = [...messages].reverse().find((item) => item.role === "user");
    if (!message) return;
    initialized = true;
    updateSelected({ sessionID: props.sessionID, ...message.model });
  });

  onMount(() => {
    const unsubscribeMessage = props.api.event.on("message.updated", (event) => {
      if (event.properties.sessionID !== props.sessionID) return;
      const message = event.properties.info;
      if (message.role === "user") {
        updateSelected({ sessionID: props.sessionID, ...message.model });
      }
    });

    onCleanup(() => {
      unsubscribeMessage();
    });
  });

  const current = createMemo(() => {
    const live = selected();
    const model = live?.sessionID === props.sessionID ? live : undefined;
    if (!model || model.providerID !== PROVIDER_ID) return undefined;

    const provider = props.api.state.provider.find((item) => item.id === PROVIDER_ID);
    if (!provider) return undefined;
    const tui = asRecord(provider.options.tui);
    const models = asRecord(tui?.models);
    const metadata = parseMetadata(models?.[model.modelID]);
    if (!metadata) return undefined;

    return {
      id: model.modelID,
      name: provider.models[model.modelID]?.name ?? model.modelID,
      ...metadata,
    };
  });

  createEffect(() => {
    current()?.id;
    setOpen(true);
  });

  return (
    <Show when={current()}>
      {(model) => (
        <box gap={1}>
          <text fg={theme().text}>
            <b>CodeBuddy</b>
          </text>
          <Show when={model().badge}>
            {(badge) => (
              <box
                alignSelf="flex-start"
                backgroundColor={badgeColor(badge().color, theme().info)}
                paddingLeft={1}
                paddingRight={1}
              >
                <text fg={badgeTextColor(badge().color, theme().background)}>{badge().label}</text>
              </box>
            )}
          </Show>
          <box
            flexDirection="row"
            gap={1}
            onMouseDown={() => model().descriptionZh && setOpen((value) => !value)}
          >
            <text fg={model().descriptionZh ? theme().text : theme().textMuted}>
              {model().descriptionZh ? (open() ? "▼" : "▶") : " "}
            </text>
            <text fg={theme().text} flexShrink={1}>{model().name}</text>
          </box>
          <Show when={open() && model().descriptionZh}>
            {(description) => <text fg={theme().textMuted}>{description()}</text>}
          </Show>
          <Show when={model().hover?.textZh}>
            {(text) => <text fg={theme().textMuted}>{text()}</text>}
          </Show>
        </box>
      )}
    </Show>
  );
}

const tui: TuiPlugin = async (api, options) => {
  if (options?.enabled !== true) return;
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_ctx, props) {
        return <ModelInfo api={api} sessionID={props.session_id} />;
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: "codebuddy-auth-tui",
  tui,
};

export default plugin;
