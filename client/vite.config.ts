import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("phaser")) {
            return "vendor-phaser";
          }
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) {
            return "vendor-socket";
          }
          return "vendor";
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
