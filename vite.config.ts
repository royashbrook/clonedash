import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({
  plugins: [
    svelte(),
    {
      name: "build-marker",
      transformIndexHtml: (html) =>
        html.replaceAll(
          "%CLONEDASH_BUILD%",
          process.env.CLONEDASH_BUILD || "development",
        ),
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.CLONEDASH_VERSION || "development",
    ),
    __BUILD_ID__: JSON.stringify(process.env.CLONEDASH_BUILD || "development"),
    __SOURCE_SHA__: JSON.stringify(
      process.env.CLONEDASH_SOURCE || "development",
    ),
  },
  server: { host: "127.0.0.1", port: 4192, strictPort: true },
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.PORT || 4191),
    strictPort: true,
  },
  build: {
    target: "es2022",
    manifest: true,
    license: { fileName: "licenses.md" },
    rolldownOptions: {
      preserveEntrySignatures: "strict",
      input: { app: "index.html", sw: "src/sw.ts", music: "src/music.ts" },
      output: {
        entryFileNames: (chunk) =>
          ["sw", "music"].includes(chunk.name)
            ? "[name].js"
            : "assets/[name]-[hash].js",
        postBanner: "/* Bundled dependency licenses: /licenses.md */",
      },
    },
  },
});
