import { CodeBuddyAuthPlugin, codebuddyShared } from "./v1.js";
import type { Context } from "@opencode/plugin/promise/plugin";

export { CodeBuddyAuthPlugin } from "./v1.js";

export default {
  id: "codebuddy-auth",
  async setup(context: Context) {
    const { createV2Definition } = await import("./v2.js");
    return createV2Definition(codebuddyShared).setup(context);
  },
  server: CodeBuddyAuthPlugin,
};
