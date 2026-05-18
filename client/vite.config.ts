import { defineConfig } from "vite";
import { execSync } from "node:child_process";

function readGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_COMMIT": JSON.stringify(readGitCommit())
  },
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
    port: 5288
  }
});
