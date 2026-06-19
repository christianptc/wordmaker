import { defineConfig } from "vite";

// base: "./" makes the built dist/ use relative paths, so it works both when
// hosted on a server and when opened directly as a file (file://) on any OS.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
