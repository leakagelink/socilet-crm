import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

function copyHtaccess() {
  return {
    name: "copy-htaccess",
    closeBundle() {
      const src = path.resolve(import.meta.dirname, "public/.htaccess");
      const distDir = path.resolve(import.meta.dirname, "dist");
      if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
      if (existsSync(src)) copyFileSync(src, path.join(distDir, ".htaccess"));
    },
  };
}

function emailApi(env: Record<string, string>) {
  const run = (req: unknown, res: unknown, next: () => void) => {
    const url = String((req as { url?: string }).url || "");
    if (!url.split("?")[0].startsWith("/api/email")) return next();
    const spec = "./server/email-api.mjs";
    void import(spec).then((m: { handleEmailRequest: (req: unknown, res: unknown, env: Record<string, string>) => Promise<boolean> }) =>
      m.handleEmailRequest(req, res, env),
    );
  };
  return {
    name: "socilet-email-api",
    configureServer(server: { middlewares: { use: (fn: typeof run) => void } }) {
      server.middlewares.use(run);
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof run) => void } }) {
      server.middlewares.use(run);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), copyHtaccess(), emailApi(env)],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 43721,
      strictPort: true,
    },
    preview: {
      host: "0.0.0.0",
      port: 43721,
      strictPort: true,
    },
  };
});
