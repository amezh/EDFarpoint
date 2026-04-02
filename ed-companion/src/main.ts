import "virtual:uno.css";
import { mount } from "svelte";

const isOverlay = window.location.pathname === "/overlay";

if (isOverlay) {
  const { default: OverlayWidget } = await import("./lib/components/overlay/OverlayWidget.svelte");
  mount(OverlayWidget, { target: document.getElementById("app")! });
} else {
  const { default: App } = await import("./App.svelte");
  mount(App, { target: document.getElementById("app")! });
}
