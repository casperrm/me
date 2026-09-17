import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cedar: {
          50: "#f2f7f5",
          100: "#dcece4",
          200: "#b9d9ca",
          300: "#8fc0a9",
          400: "#5fa085",
          500: "#3c8268",
          600: "#2b6752",
          700: "#235243",
          800: "#1d4237",
          900: "#18362e",
          950: "#0c1e19",
        },
      },
    },
  },
  plugins: [],
};
export default config;
