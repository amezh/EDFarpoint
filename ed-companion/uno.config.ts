import { defineConfig, presetUno, presetIcons } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetIcons()],
  theme: {
    colors: {
      ed: {
        orange: "#e88c00",
        amber: "#d4a44a",
        blue: "#3a9bdc",
        cyan: "#00b4d8",
        green: "#2ecc40",
        red: "#ff4136",
        dim: "#5a5a5a",
        bg: "#0a0e14",
        panel: "#111720",
        surface: "#1a2030",
        border: "#2a3545",
        text: "#c8ccd0",
        "text-muted": "#6b7280",
      },
    },
  },
  shortcuts: {
    "ed-card": "bg-ed-surface border border-ed-border rounded-lg p-3",
    "ed-btn":
      "px-3 py-1.5 rounded bg-ed-surface border border-ed-border text-ed-text hover:bg-ed-panel cursor-pointer transition-colors",
    "ed-btn-primary":
      "px-3 py-1.5 rounded bg-ed-orange text-black font-semibold hover:bg-ed-amber cursor-pointer transition-colors",
  },
});
