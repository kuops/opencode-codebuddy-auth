/** @jsxImportSource @opentui/solid */
import type { Context } from "@opencode/plugin/tui/plugin";
import { RGBA } from "@opentui/core";
import { createMemo } from "solid-js";
import {
  asRecord,
  ModelCatalog,
  parseMetadata,
  PROVIDER_ID,
  themeColor,
  type CatalogModel,
  type ThemePalette,
} from "./tui-shared.js";

export async function setupV2(ctx: Context): Promise<() => void> {
  const location = ctx.location ?? ctx.data.location.default();
  await ctx.data.location.model.sync(location).catch(() => {});

  function Catalog() {
    const palette = (): ThemePalette => {
      const theme = asRecord(ctx.theme);
      const text = asRecord(theme?.text);
      const background = asRecord(theme?.background);
      const info = asRecord(asRecord(background?.feedback)?.info);
      return {
        text: themeColor(text?.base, RGBA.fromHex("#E7E7E7")),
        textMuted: themeColor(text?.muted, RGBA.fromHex("#8B949E")),
        info: themeColor(info?.base, RGBA.fromHex("#00B159")),
        border: themeColor(asRecord(theme?.border)?.base, RGBA.fromHex("#444C56")),
        background: themeColor(background?.base, RGBA.fromHex("#0D1117")),
      };
    };
    const models = createMemo<CatalogModel[]>(() =>
      (ctx.data.location.model.list(location) ?? [])
        .filter((model) => model.providerID === PROVIDER_ID && model.enabled)
        .map((model) => {
          const details = parseMetadata(asRecord(model.settings)?.tui);
          return { id: model.id, name: details?.name ?? model.name ?? model.id, ...details };
        }),
    );
    return <ModelCatalog palette={palette} models={models} />;
  }

  return ctx.ui.slot({
    append: "sidebar.content",
    render: () => <Catalog />,
  });
}
