import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cedar: {
          50: "#f4f7f3",
          100: "#e5ede2",
          200: "#c9dbc3",
          300: "#a3c197",
          400: "#78a267",
          500: "#57854a",
          600: "#436a39",
          700: "#37542f",
          800: "#2e4429",
          900: "#273923",
          950: "#121f10",
        },
      },
    },
  },
  plugins: [],
};

export default config;
