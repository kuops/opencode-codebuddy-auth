import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import type { Context } from "@opencode/plugin/tui/plugin";
import { tuiV1 } from "./tui-v1.js";
import { setupV2 } from "./tui-v2.js";

const plugin: TuiPluginModule & {
  id: string;
  setup?: (context: Context) => Promise<() => void>;
} = {
  id: "codebuddy-auth-tui",
  tui: tuiV1,
  setup: setupV2,
};

export default plugin;
