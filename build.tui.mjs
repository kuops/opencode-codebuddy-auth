import * as esbuild from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

await esbuild.build({
  entryPoints: ["src/tui.tsx"],
  outfile: "dist/tui.js",
  format: "esm",
  platform: "node",
  bundle: true,
  logOverride: { "package.json": "silent" },
  external: ["@opencode-ai/*", "@opentui/*", "solid-js"],
  plugins: [solidPlugin({ solid: { moduleName: "@opentui/solid", generate: "universal" } })],
});
