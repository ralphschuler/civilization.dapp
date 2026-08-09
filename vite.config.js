import { defineConfig } from "vite";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  // GitHub Pages serves project sites below /<repository>/; local demo stays at root.
  base: process.env.GITHUB_ACTIONS && repository ? `/${repository}/` : "/",
});
