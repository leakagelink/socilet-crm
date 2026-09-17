import { defineConfig } from "vite";
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

    export default defineConfig({
      plugins: [react(), tailwindcss(), copyHtaccess()],
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
    });
