import "virtual:uno.css";
import { mount } from "svelte";
import OverlayWidget from "./lib/components/overlay/OverlayWidget.svelte";

mount(OverlayWidget, { target: document.getElementById("app")! });
