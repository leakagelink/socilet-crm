import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.socilet.crm",
  appName: "Socilet CRM",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    StatusBar: {
      style: "DARK",
    },
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
};

export default config;
