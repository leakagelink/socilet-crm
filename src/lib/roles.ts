export type RoleName = "admin" | "designer" | "accountant";

export const STAFF_ROLES: RoleName[] = ["admin", "designer", "accountant"];

export function isStaffRole(role: unknown): role is RoleName {
  return role === "admin" || role === "designer" || role === "accountant";
}

export const ROLE_HOME: Record<RoleName, string> = {
  admin: "/",
  designer: "/tasks",
  accountant: "/",
};

const DESIGNER = [
  "/",
  "/follow-ups",
  "/clients",
  "/projects",
  "/tasks",
  "/workspaces",
  "/meetings",
  "/reminders",
  "/activity",
  "/notifications",
  "/account",
  "/calculator",
];

const ACCOUNTANT = [
  "/",
  "/follow-ups",
  "/clients",
  "/quotations",
  "/invoices",
  "/project-addons",
  "/digital-products",
  "/recurring-earnings",
  "/other-income",
  "/cosmofeed",
  "/cosmofeed-products",
  "/cosmofeed-analytics",
  "/cosmofeed-compare",
  "/spends",
  "/investments",
  "/lend-borrow",
  "/balance-tracker",
  "/payment-methods",
  "/analytics",
  "/gst",
  "/calculator",
  "/meetings",
  "/activity",
  "/reminders",
  "/notifications",
  "/account",
];

export function canAccess(role: RoleName | undefined, path: string) {
  if (!role) return false;
  if (role === "admin") return true;
  const allowed = role === "designer" ? DESIGNER : role === "accountant" ? ACCOUNTANT : [];
  if (allowed.includes(path)) return true;
  if (path.startsWith("/clients/")) return allowed.includes("/clients");
  if (path.startsWith("/invoices")) return allowed.includes("/invoices");
  if (path.startsWith("/quotations")) return allowed.includes("/quotations");
  if (path.startsWith("/meetings")) return allowed.includes("/meetings");
  if (path.startsWith("/print/")) return allowed.includes("/invoices") || allowed.includes("/quotations");
  return false;
}
