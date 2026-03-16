// @ts-check
import { defineConfig } from "astro/config";
import { createLogger } from "vite";

import tailwindcss from "@tailwindcss/vite";

import node from "@astrojs/node";

const logger = createLogger();
const originalWarn = logger.warn;

logger.warn = (msg, options) => {
  if (typeof msg === "string") {
    const isAstroUnusedExternalImportWarning =
      msg.includes('"matchHostname", "matchPathname", "matchPort" and "matchProtocol"') &&
      msg.includes("@astrojs/internal-helpers/remote");

    const isAstroNodeExternalizationWarning =
      msg.includes("Module \"") &&
      msg.includes("externalized for browser compatibility") &&
      (msg.includes("node_modules/@astrojs/node/") ||
        msg.includes("node_modules/astro/dist/core/app/node.js") ||
        msg.includes("node_modules/send/index.js") ||
        msg.includes("node_modules/etag/index.js") ||
        msg.includes("node_modules/mime-types/index.js") ||
        msg.includes("node_modules/on-finished/index.js"));

    if (isAstroUnusedExternalImportWarning || isAstroNodeExternalizationWarning) {
      return;
    }
  }

  originalWarn(msg, options);
};

// https://astro.build/config
export default defineConfig({
  output: "server",

  security: {
    checkOrigin: false,
  },

  vite: {
    customLogger: logger,
    plugins: [tailwindcss()],
  },

  adapter: node({
    mode: "standalone",
  }),
});
