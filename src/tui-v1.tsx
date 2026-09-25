/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createMemo } from "solid-js";
import {
  asRecord,
  ModelCatalog,
  parseMetadata,
  PROVIDER_ID,
  type CatalogModel,
} from "./tui-shared.js";

function models(api: TuiPluginApi): () => CatalogModel[] {
  return createMemo(() => {
    const provider = api.state.provider.find((item) => item.id === PROVIDER_ID);
    if (!provider) return [];
    const metadata = asRecord(asRecord(provider.options.tui)?.models);
    return Object.entries(provider.models).map(([id, model]) => {
      const details = parseMetadata(metadata?.[id]);
      return { id, name: details?.name ?? model.name ?? id, ...details };
    });
  });
}

export const tuiV1: TuiPlugin = async (api, options) => {
  if (options?.enabled === false) return;
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content: () => (
        <ModelCatalog palette={() => api.theme.current} models={models(api)} />
      ),
    },
  });
};
