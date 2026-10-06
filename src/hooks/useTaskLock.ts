import { useSyncExternalStore } from "react";
import { subscribeTaskLock, taskLockEnabled, tasksAreLocked, tasksUnlocked } from "@/lib/taskLock";

export function useTaskLock() {
  const enabled = useSyncExternalStore(subscribeTaskLock, taskLockEnabled, () => false);
  const unlocked = useSyncExternalStore(subscribeTaskLock, tasksUnlocked, () => true);
  const locked = useSyncExternalStore(subscribeTaskLock, tasksAreLocked, () => false);
  return { enabled, unlocked, locked };
}
