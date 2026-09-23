export const BRAND_LOGO = "/socilet-logo.png";
export const BRAND_NAME = "Socilet";
export const BRAND_TAGLINE = "Brand your dream";

export function brandLogoUrl(url?: string) {
  const u = String(url || "").trim();
  if (!u || /socilet-logo\.svg$/i.test(u) || u === "/favicon.svg") return BRAND_LOGO;
  return u;
}
