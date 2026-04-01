// Remote client — connects to a host's WebSocket and populates stores from the stream

import { systemStore } from "$lib/stores/system.svelte";
import { routeStore } from "$lib/stores/route.svelte";
import { statusStore } from "$lib/stores/status.svelte";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionState: ConnectionState = "disconnected";
let onStateChange: ((state: ConnectionState) => void) | null = null;

export function getConnectionState(): ConnectionState {
  return connectionState;
}

export function setConnectionListener(fn: (state: ConnectionState) => void) {
  onStateChange = fn;
}

function setState(s: ConnectionState) {
  connectionState = s;
  onStateChange?.(s);
}

export function connectToHost(host: string, port: number) {
  disconnect();
  setState("connecting");

  const url = `ws://${host}:${port}/ws`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    setState("connected");
    console.log("[remote] Connected to", url);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.warn("[remote] Failed to parse message:", e);
    }
  };

  ws.onclose = () => {
    setState("disconnected");
    console.log("[remote] Disconnected, reconnecting in 3s...");
    reconnectTimer = setTimeout(() => connectToHost(host, port), 3000);
  };

  ws.onerror = () => {
    setState("error");
  };
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null; // prevent reconnect
    ws.close();
    ws = null;
  }
  setState("disconnected");
}

function handleMessage(msg: { type: string; payload: unknown }) {
  switch (msg.type) {
    case "snapshot":
      applySnapshot(msg.payload as Record<string, unknown>);
      break;

    // Live state updates from host
    case "system":
      if (msg.payload) applySystemState(msg.payload);
      break;
    case "route":
      if (msg.payload) applyRouteState(msg.payload);
      break;
    case "expedition":
      if (msg.payload) applyExpeditionState(msg.payload);
      break;
    case "status":
      if (msg.payload) applyStatusState(msg.payload);
      break;
  }
}

function applySnapshot(snapshot: Record<string, unknown>) {
  if (snapshot.system) applySystemState(snapshot.system);
  if (snapshot.route) applyRouteState(snapshot.route);
  if (snapshot.expedition) applyExpeditionState(snapshot.expedition);
  if (snapshot.status) applyStatusState(snapshot.status);
}

function applySystemState(data: unknown) {
  // The system data comes as a serialized SystemState — we'd need to hydrate the store
  // For now, store it raw — the remote view can read it directly
  const d = data as Record<string, unknown>;
  if (d.StarSystem || d.name) {
    systemStore.setSystem(d);
  }
}

function applyRouteState(data: unknown) {
  const d = data as Record<string, unknown>;
  if (d.systems) {
    // Route state comes pre-processed, set it directly
    routeStore.setRoute({ Route: d.systems });
  }
}

function applyExpeditionState(data: unknown) {
  // Expedition data is the visited array — store via sessionStorage for the store to pick up
  if (Array.isArray(data)) {
    try {
      sessionStorage.setItem("expeditionStore", JSON.stringify({
        visited: data,
        currentSystemName: data.length > 0 ? (data[data.length - 1] as Record<string, unknown>).name : null,
      }));
    } catch { /* ignore */ }
  }
}

function applyStatusState(data: unknown) {
  statusStore.update(data);
}
