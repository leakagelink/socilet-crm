import { useEffect, useState } from "react";

const KEY = "socilet.agent.full";
const EVT = "socilet-agent-full";

function readFull() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useAgentImmersive() {
  const [full, setFull] = useState(readFull);
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const syncMq = () => setMobile(mq.matches);
    syncMq();
    mq.addEventListener("change", syncMq);
    const syncFull = () => setFull(readFull());
    syncFull();
    window.addEventListener(EVT, syncFull);
    window.addEventListener("storage", syncFull);
    return () => {
      mq.removeEventListener("change", syncMq);
      window.removeEventListener(EVT, syncFull);
      window.removeEventListener("storage", syncFull);
    };
  }, []);

  function setImmersive(next: boolean) {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    setFull(next);
    window.dispatchEvent(new Event(EVT));
  }

  return { full, mobile, immersive: full || mobile, setImmersive };
}
