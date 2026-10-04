import { createCn } from "cn/config"

// Register the custom theme utilities from src/styles/globals.css so `cn` doesn't
// mistake e.g. `text-body` (a font size) for a color and drop `text-text`.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["h1", "h2", "h3", "button", "body", "small", "tiny", "tab"] }],
      "font-family": [{ font: ["display", "body", "heading"] }],
      shadow: [{ shadow: ["pixel"] }],
      "drop-shadow": [{ "drop-shadow": ["pixel"] }],
      gap: [{ gap: ["button-group"] }],
      "gap-x": [{ "gap-x": ["button-group"] }],
      "gap-y": [{ "gap-y": ["button-group"] }],
    },
  },
})
