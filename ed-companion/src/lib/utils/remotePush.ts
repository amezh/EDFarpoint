// Push state updates to the remote WebSocket server via Tauri command
import { invoke } from "@tauri-apps/api/core";

const pendingPushes = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 500;

/** Push a state update to the remote server (debounced per key) */
export function pushRemoteState(key: string, value: unknown) {
  // Cancel any pending push for this key
  const existing = pendingPushes.get(key);
  if (existing) clearTimeout(existing);

  pendingPushes.set(
    key,
    setTimeout(() => {
      pendingPushes.delete(key);
      invoke("push_remote_state", { key, value }).catch(() => {
        // Remote server may not be enabled — ignore errors
      });
    }, DEBOUNCE_MS),
  );
}
