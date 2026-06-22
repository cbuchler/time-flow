import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    strictPort: true,
    port: 1420,
  },
  envPrefix: ["VITE_", "TAURI_"],
  resolve: {
    alias: {
      "react-native": "react-native-web",
      "react-native$": "react-native-web",
    },
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".jsx", ".js", ".json"],
  },
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
  },
});
