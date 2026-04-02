import "virtual:uno.css";
import { mount } from "svelte";

async function bootstrap() {
  const target = document.getElementById("app")!;

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const label = getCurrentWindow().label;

    if (label === "overlay") {
      // Make HTML/body transparent for the overlay window
      document.documentElement.style.backgroundColor = "transparent";
      document.body.style.backgroundColor = "transparent";
      const { default: OverlayWidget } = await import("./lib/components/overlay/OverlayWidget.svelte");
      mount(OverlayWidget, { target });
    } else {
      const { default: App } = await import("./App.svelte");
      mount(App, { target });
    }
  } catch (err) {
    console.error("[main] bootstrap failed, falling back to App", err);
    const { default: App } = await import("./App.svelte");
    mount(App, { target });
  }
}

bootstrap();
