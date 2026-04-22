import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"]
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
