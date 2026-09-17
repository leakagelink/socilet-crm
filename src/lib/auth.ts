import { db, ensureSeed, type Profile, type RoleName } from "@/lib/db";
import { hashPassword } from "@/lib/utils";
import { supabase, supabaseEnabled } from "@/lib/supabase";

const KEY = "socilet.session";

export type Session = {
  userId: string;
  email: string;
  fullName: string;
  role: RoleName;
};

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(s: Session | null) {
  if (!s) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(s));
}

export async function signIn(email: string, password: string): Promise<Session> {
  await ensureSeed();
  const normalized = email.trim().toLowerCase();

  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error || !data.user) throw new Error(error?.message ?? "Sign-in failed");
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const role = (roles?.[0]?.role as RoleName | undefined) ?? "user";
    const session: Session = {
      userId: data.user.id,
      email: data.user.email ?? normalized,
      fullName: (data.user.user_metadata?.full_name as string | undefined) ?? normalized,
      role,
    };
    writeSession(session);
    return session;
  }

  const matches = await db.profiles.where("email").equals(normalized).toArray();
  const profile = matches.find((p) => p.password_hash) ?? matches[0];
  if (!profile) throw new Error("Invalid email or password");
  const expected = await hashPassword(normalized, password);
  if (expected !== profile.password_hash) throw new Error("Invalid email or password");
  const roleRow = await db.user_roles.where("user_id").equals(profile.id).first();
  if (!roleRow) throw new Error("No role assigned");
  const session: Session = {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: roleRow.role,
  };
  writeSession(session);
  return session;
}

export async function signOut() {
  if (supabaseEnabled && supabase) await supabase.auth.signOut();
  writeSession(null);
}

export async function loadProfile(userId: string): Promise<Profile | undefined> {
  return db.profiles.get(userId);
}
