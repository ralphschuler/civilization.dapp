# Release and supply-chain runbook

## Permission model

`container.yml` defaults to `contents: read`. Its `verify` job is read-only and runs for pull requests; its `publish` job runs only for pushes after verification and receives `contents: read` plus `packages: write`. Therefore pull-request code cannot publish a package. `deploy-pages.yml` defaults to `contents: read`; the build job adds only `pages: read` for `configure-pages`, while the non-PR deploy job alone receives `pages: write` and `id-token: write`.

## Updating pins

Dependabot opens weekly, review-only pull requests for GitHub Actions and Docker images. Do not configure an automerge rule for either ecosystem. Review every update, including its readable tag comment and immutable SHA or digest. For a Docker digest change, resolve the proposed tag again with `skopeo inspect docker://docker.io/library/<image>:<tag>` and compare the resulting digest with the PR before merge. Run `pnpm security:workflows` and `pnpm check`; build and smoke-test the image when the Dockerfile or Compose image changes.

## Required repository setting

An administrator must manually enable branch protection for release branches and require Code Owner review. `CODEOWNERS` assigns `@ralphschuler` to workflows, Dependabot configuration, Dockerfile, and Compose images; GitHub will enforce that ownership only after the branch-protection setting is enabled.

## Rollback

If a release, action, or image pin is suspect, stop promotion and revert the merged pin PR (or deploy the prior image digest). Re-run the workflow validator and normal checks, then open a reviewed corrective PR. Do not replace an immutable pin in place without review.
