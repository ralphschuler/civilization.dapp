import { defineConfig } from "vite";

const pagesBasePath = process.env.PAGES_BASE_PATH;
const base = pagesBasePath ? `${pagesBasePath.replace(/\/$/, "")}/` : "/";

export default defineConfig({
  // `actions/configure-pages` owns this value, including custom-domain paths.
  // Local demos intentionally remain mounted at the web root.
  base,
});
