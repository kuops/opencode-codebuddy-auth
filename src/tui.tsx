/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { RGBA } from "@opentui/core";
import { createMemo, createSignal, For, Show } from "solid-js";

const PROVIDER_ID = "codebuddy";

interface Badge {
  label: string;
  color?: string;
}

interface Hover {
  textZh: string;
}

interface ModelMetadata {
  name?: string;
  descriptionZh?: string;
  badge?: Badge;
  hover?: Hover;
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
  const name = typeof record.name === "string" ? record.name : undefined;
  const hoverRecord = asRecord(record.hover);
  const hoverTextZh =
    typeof hoverRecord?.textZh === "string" ? hoverRecord.textZh : undefined;
  const hover = hoverTextZh ? { textZh: hoverTextZh } : undefined;
  if (!name && !descriptionZh && !badge && !hover) return undefined;
  return { name, descriptionZh, badge, hover };
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

function ModelCatalog(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current;
  const [open, setOpen] = createSignal(false);
  const [hoveredModelID, setHoveredModelID] = createSignal<string>();
  const models = createMemo(() => {
    const provider = props.api.state.provider.find((item) => item.id === PROVIDER_ID);
    if (!provider) return [];
    const tui = asRecord(provider.options.tui);
    const metadata = asRecord(tui?.models);
    return Object.entries(provider.models).map(([id, model]) => {
      const details = parseMetadata(metadata?.[id]);
      return {
        id,
        name: details?.name ?? model.name ?? id,
        ...details,
      };
    });
  });

  return (
    <Show when={models().length > 0}>
      <box gap={0}>
        <box
          flexDirection="row"
          gap={1}
          onMouseDown={() => {
            setOpen((value) => !value);
            setHoveredModelID(undefined);
          }}
        >
          <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
          <text fg={theme().text}>
            <b>CodeBuddy 模型</b>
          </text>
        </box>
        <Show when={open()}>
          <box gap={0}>
            <For each={models()}>
              {(model) => {
                const hasDetails = model.descriptionZh || model.hover?.textZh;
                return (
                  <box gap={0}>
                    <box flexDirection="row" gap={1} width="100%">
                      <text
                        fg={theme().textMuted}
                        width={22}
                        flexShrink={1}
                        wrapMode="none"
                        truncate={true}
                        onMouseOver={() =>
                          setHoveredModelID((current) =>
                            current === model.id ? current : model.id,
                          )
                        }
                        onMouseOut={() =>
                          setHoveredModelID((current) =>
                            current === model.id ? undefined : current,
                          )
                        }
                      >
                        • {model.name}
                      </text>
                      <Show when={model.badge}>
                        {(badge) => (
                          <text
                            bg={badgeColor(badge().color, theme().info)}
                            fg={badgeTextColor(badge().color, theme().background)}
                          >
                            {badge().label}
                          </text>
                        )}
                      </Show>
                    </box>
                    <Show when={hoveredModelID() === model.id && hasDetails}>
                      <box gap={0} marginLeft={2}>
                        <Show when={model.descriptionZh}>
                          {(description) => (
                            <box
                              border={true}
                              borderColor={theme().border}
                              paddingLeft={1}
                              paddingRight={1}
                            >
                              <text fg={theme().textMuted}>{description()}</text>
                            </box>
                          )}
                        </Show>
                        <Show when={model.hover?.textZh}>
                          {(text) => (
                            <box
                              border={true}
                              borderColor={theme().border}
                              paddingLeft={1}
                              paddingRight={1}
                            >
                              <text fg={theme().textMuted}>{text()}</text>
                            </box>
                          )}
                        </Show>
                      </box>
                    </Show>
                  </box>
                );
              }}
            </For>
          </box>
        </Show>
      </box>
    </Show>
  );
}

const tui: TuiPlugin = async (api, options) => {
  if (options?.enabled === false) return;
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content() {
        return <ModelCatalog api={api} />;
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: "codebuddy-auth-tui",
  tui,
};

export default plugin;
