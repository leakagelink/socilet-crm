import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const IDLE_MS = 5 * 60 * 1000;
const ACTIVITY_KEY = "socilet.lastActivity";
const LOGOUT_KEY = "socilet.idleLogout";

function stamp() {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function lastStamp() {
  try {
    const n = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function IdleLogout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const busy = useRef(false);

  useEffect(() => {
    if (!session) return;
    stamp();
    let lastBump = 0;
    let lastTouch = 0;
    const bump = () => {
      const now = Date.now();
      if (now - lastBump < 1000) return;
      lastBump = now;
      stamp();
      if (now - lastTouch > 20_000) {
        lastTouch = now;
        void import("@/lib/apiBase").then(({ apiFetch }) => apiFetch("/api/auth/touch", { method: "POST" })).catch(() => {});
      }
    };
    const leave = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        localStorage.setItem(LOGOUT_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      await signOut();
      navigate("/login", { replace: true });
    };
    const check = () => {
      const last = lastStamp();
      if (last && Date.now() - last >= IDLE_MS) void leave();
    };
    const events = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart", "wheel", "click"];
    for (const name of events) window.addEventListener(name, bump, { capture: true, passive: true });
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGOUT_KEY && e.newValue) void leave();
    };
    window.addEventListener("storage", onStorage);
    const id = window.setInterval(check, 1000);
    check();
    return () => {
      for (const name of events) window.removeEventListener(name, bump, true);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, [session, signOut, navigate]);

  return null;
}
