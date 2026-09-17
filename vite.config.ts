import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

function sociletApi(env: Record<string, string>) {
  const run = (req: unknown, res: unknown, next: () => void) => {
    const url = String((req as { url?: string }).url || "");
    const route = url.split("?")[0];
    if (route.startsWith("/api/auth")) {
      const spec = pathToFileURL(path.join(import.meta.dirname, "server", "auth-api.mjs")).href;
      void import(spec).then((m: { handleAuthRequest: (req: unknown, res: unknown, env: Record<string, string>) => Promise<boolean> }) =>
        m.handleAuthRequest(req, res, { ...process.env, ...env } as Record<string, string>),
      );
      return;
    }
    if (route.startsWith("/api/email")) {
      const spec = pathToFileURL(path.join(import.meta.dirname, "server", "email-api.mjs")).href;
      void import(spec).then((m: { handleEmailRequest: (req: unknown, res: unknown, env: Record<string, string>) => Promise<boolean> }) =>
        m.handleEmailRequest(req, res, { ...process.env, ...env } as Record<string, string>),
      );
      return;
    }
    if (route.startsWith("/api/crm")) {
      const spec = pathToFileURL(path.join(import.meta.dirname, "server", "crm-api.mjs")).href;
      void import(spec).then((m: { handleCrmRequest: (req: unknown, res: unknown, env: Record<string, string>) => Promise<boolean> }) =>
        m.handleCrmRequest(req, res, { ...process.env, ...env } as Record<string, string>),
      );
      return;
    }
    next();
  };
  return {
    name: "socilet-api",
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
    plugins: [react(), tailwindcss(), copyHtaccess(), sociletApi(env)],
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
