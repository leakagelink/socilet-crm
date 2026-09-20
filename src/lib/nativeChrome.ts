import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

export async function applyNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add("is-native", `is-${Capacitor.getPlatform()}`);
  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.show();
  } catch {
    /* browser preview */
  }
}
