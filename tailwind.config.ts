import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        euphoria: {
          dark: '#1a0d2e',
          purple: '#2d1b3d',
          accent: '#7e22ce',
          green: '#22c55e',
          red: '#ef4444',
        }
      },
    },
  },
  plugins: [],
};
export default config;
