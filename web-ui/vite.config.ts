import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

const appBase = process.env.VITE_BASE || "/";

// https://vite.dev/config/
export default defineConfig({
  base: appBase,
  plugins: [vue(), tailwindcss()],
  server: {
    host: "0.0.0.0",
  },
  preview: {
    host: "0.0.0.0",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
