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
      style: "LIGHT",
    },
    SystemBars: {
      insetsHandling: "css",
      style: "LIGHT",
    },
  },
};

export default config;
