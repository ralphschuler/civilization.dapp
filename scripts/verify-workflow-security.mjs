import { readFile } from "node:fs/promises";
import process from "node:process";

const files = {
  container: ".github/workflows/container.yml",
  pages: ".github/workflows/deploy-pages.yml",
  dockerfile: "Dockerfile",
  compose: "compose.yaml",
  dependabot: ".github/dependabot.yml",
  owners: ".github/CODEOWNERS",
};
const sha = "[0-9a-f]{40}";
const digest = "sha256:[0-9a-f]{64}";
const requirements = [
  [
    "container global contents is read-only",
    /permissions:\n  contents: read\n\njobs:/,
  ],
  [
    "verify has only contents: read",
    /verify:\n    permissions:\n      contents: read\n    runs-on:/,
  ],
  [
    "publish has contents: read and packages: write",
    /publish:[\s\S]*?permissions:\n      contents: read\n      packages: write\n    steps:/,
  ],
  [
    "pages global contents is read-only",
    /permissions:\n  contents: read\n\nconcurrency:/,
  ],
  [
    "pages build has only required read permissions",
    /build:\n    permissions:\n      contents: read\n      pages: read\n    runs-on:/,
  ],
  [
    "pages deploy has only deployment permissions",
    /deploy:[\s\S]*?permissions:\n      pages: write\n      id-token: write\n    environment:/,
  ],
  [
    "container PostgreSQL is digest-pinned",
    new RegExp(`image: postgres:16@${digest}`),
  ],
  [
    "compose PostgreSQL is digest-pinned",
    new RegExp(`image: postgres:16-alpine@${digest}`),
  ],
  [
    "all Dockerfile Node images are digest-pinned",
    new RegExp(`FROM node:22-alpine@${digest} AS (build|runtime)`, "g"),
  ],
  [
    "Dependabot GitHub Actions updates are review-only",
    /Review-only: Dependabot opens weekly PRs; repository automation must not auto-merge them\.[\s\S]*?package-ecosystem: "github-actions"[\s\S]*?interval: "weekly"/,
  ],
  [
    "Dependabot Docker updates are review-only",
    /Review-only: validate tag-to-digest changes before manually merging each PR\.[\s\S]*?package-ecosystem: "docker"[\s\S]*?interval: "weekly"/,
  ],
  [
    "workflow and image files have Code Owners",
    /\/\.github\/workflows\/ @ralphschuler\n\/\.github\/dependabot\.yml @ralphschuler\n\/Dockerfile @ralphschuler\n\/compose\.yaml @ralphschuler/,
  ],
];
const contents = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [
      key,
      await readFile(file, "utf8"),
    ]),
  ),
);
const failures = [];
for (const [description, pattern] of requirements) {
  const source =
    description.startsWith("container") ||
    description.startsWith("verify") ||
    description.startsWith("publish")
      ? contents.container
      : description.startsWith("pages")
        ? contents.pages
        : description.startsWith("compose")
          ? contents.compose
          : description.startsWith("Dependabot")
            ? contents.dependabot
            : description.startsWith("workflow")
              ? contents.owners
              : contents.dockerfile;
  const matches = source.match(pattern);
  if (!matches || (pattern.global && matches.length !== 2))
    failures.push(description);
}
for (const [file, workflow] of [
  [files.container, contents.container],
  [files.pages, contents.pages],
]) {
  for (const line of workflow
    .split("\n")
    .filter(
      (value) =>
        value.trimStart().startsWith("uses:") ||
        value.trimStart().startsWith("- uses:"),
    )) {
    if (!new RegExp(`uses: [^@\\s]+@${sha} # v\\d+`).test(line))
      failures.push(
        `${file}: action is not SHA-pinned with a version comment: ${line.trim()}`,
      );
  }
}
if (failures.length) {
  console.error("Workflow security invariant failure(s):");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else console.log("Workflow security invariants verified.");
