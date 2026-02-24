import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Change "/REPO_NAME/" to your GitHub Pages repository path (or "/").
export default defineConfig({
  plugins: [react()],
  base: "/sap-label-4up/",
});
