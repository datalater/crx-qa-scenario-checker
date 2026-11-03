/**
 * Standalone SVG for a pele diagram, free of the DOM so it can be tested in Node.
 *
 * pele colours everything through CSS variables with light fallbacks
 * (`var(--pele-bg,#fff)`). Pasted elsewhere those variables do not exist, so the
 * export bakes a palette into them and paints a solid background; the file then
 * looks the same wherever it lands.
 */

export const EXPORT_PALETTES = {
  dark: {
    bg: "#0d1117",
    fg: "#e6edf3",
    muted: "#7d8590",
    line: "#8b949e",
    surface: "#161b22",
    "surface-alt": "#21262d",
    border: "#484f58",
    accent: "#2f81f7",
  },
  light: {
    bg: "#ffffff",
    fg: "#1f2328",
    muted: "#656d76",
    line: "#57606a",
    surface: "#f6f8fa",
    "surface-alt": "#eaeef2",
    border: "#d0d7de",
    accent: "#0969da",
  },
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** `svg` is pele's output; `theme` is a key of EXPORT_PALETTES. */
export function exportSvg(svg, theme = "dark") {
  const palette = EXPORT_PALETTES[theme] || EXPORT_PALETTES.dark;
  let out = svg
    .replace(/var\(--pele-font-mono,[^)]*\)/g, "monospace")
    .replace(/var\(--pele-font,[^)]*\)/g, FONT.replace(/"/g, "&quot;"))
    // Anything not in the palette (the corner radius) keeps its fallback value.
    .replace(/var\(--pele-([a-z-]+),([^)]*)\)/g, (whole, name, fallback) => palette[name] ?? fallback);
  // A fixed size and a solid background: nothing in the file depends on its container.
  out = out.replace("max-width:100%;height:auto;", "");
  const box = /viewBox="([\d.\s-]+)"/.exec(out)?.[1].trim().split(/\s+/).map(Number);
  if (box?.length === 4) {
    const [x, y, width, height] = box;
    const background = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${palette.bg}"/>`;
    out = out.replace(/(<svg\b[^>]*>)/, `$1${background}`);
  }
  return out;
}
