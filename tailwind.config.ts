import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-prompt)", "sans-serif"],
        prompt: ["var(--font-prompt)", "sans-serif"],
        heading: ["var(--font-bebas)", "var(--font-prompt)", "sans-serif"],
        bebas: ["var(--font-bebas)", "var(--font-prompt)", "sans-serif"],
        caveat: ["var(--font-caveat)", "cursive"],
      },
      colors: {
        studio: {
          main: "#0E0D0C",        // INK BLACK (70%)
          sec: "#171512",         // SECONDARY BLACK (20%)
          card: "#171512",        // SECONDARY BLACK
          border: "#4A443A",      // LINE / BORDER
          paper: "#ECE4D3",       // AGED PAPER / CREAM (7%)
          red: "#9C2F2F",         // TATTOO RED (3% Primary Accent)
          copper: "#9C2F2F",      // Aliased to Tattoo Red for seamless system transition
          primary: "#ECE4D3",     // AGED PAPER / CREAM (Primary Text)
          secondary: "#A89F91",   // Muted cream for secondary text
          muted: "#7A7265",       // Line muted tone
        },
        ink: {
          DEFAULT: "#0E0D0C",
          sec: "#171512",
        },
        paper: {
          DEFAULT: "#ECE4D3",
          dark: "#DFD5C0",
          light: "#F4EFE6",
        },
        tattoo: {
          red: "#9C2F2F",
          "red-dark": "#7F2424",
          "red-light": "#B33939",
        },
        line: "#4A443A",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
