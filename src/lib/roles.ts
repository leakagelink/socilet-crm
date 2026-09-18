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
  "/notifications",
  "/account",
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
  "/spends",
  "/investments",
  "/balance-tracker",
  "/payment-methods",
  "/analytics",
  "/gst",
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
  if (path.startsWith("/print/")) return allowed.includes("/invoices") || allowed.includes("/quotations");
  return false;
}
