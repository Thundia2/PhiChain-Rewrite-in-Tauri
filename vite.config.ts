import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Tauri expects a fixed port; fail if it's taken
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Tell Vite to ignore watching `src-tauri` so Cargo
      // rebuild doesn't trigger a Vite reload
      ignored: ["**/src-tauri/**"],
    },
  },
});
