# Releasing Vigueur

This page is for the maintainers: a release runs from the repository's **Actions** tab, which
needs write access to the repository. To contribute a change, see
[CONTRIBUTING.md](CONTRIBUTING.md).

A release publishes the Claude Desktop bundle, `vigueur-<version>.mcpb`, on the repository's
Releases page, and the package `vigueur-mcp` on npm. `.github/workflows/release.yml` runs the CI
checks, checks the version, builds and checks the bundle, creates the tag and the release with the
bundle attached and attested, then publishes the package on npm.

## Versions

A version number lives in four files, bumped together: `package.json` (and its lockfile),
`.claude-plugin/plugin.json`, `src/version.ts` and `mcpb/manifest.json`.
`test/bundle-manifest.test.ts` fails when they differ.

## Steps

1. Bump the version in the four files above, in a pull request, and merge it.
2. In the **Actions** tab, run **Release** on `main` with **publish** unticked: a dry run. It runs
   the CI checks and builds and checks the bundle and the npm package, but publishes nothing.
3. Run it again with **publish** ticked.

## What the workflow enforces

The workflow runs only on `main`, and refuses to publish a version whose tag, `v<version>`, already
exists. It creates that tag on the commit it ran on; the "release tags" ruleset lets only admins
and GitHub Actions create, move or delete a `v*` tag. A version with a suffix, such as
`0.2.0-rc.1`, gives a pre-release, which GitHub does not mark as the latest release, and goes under
the npm tag `next`, so that `npx vigueur-mcp` keeps the latest release.

## Release notes and attestation

GitHub writes the release notes (the pull requests merged since the previous tag, and a link to the
full comparison) and shows the bundle's SHA-256 next to it; edit the notes on the release page if
needed. The attestation is a signed record, kept by GitHub, that the release workflow built the
bundle from the released commit; anyone can check a downloaded bundle with the GitHub CLI:
`gh attestation verify vigueur-0.2.0.mcpb --repo me-no-code/vigueur-mcp`.

## npm

The npm job uses npm's trusted publishing: npm takes the workflow's short-lived GitHub identity
instead of a token, so the repository holds no npm token, and npm records where the package was
built (its provenance, shown on the package page). On npmjs.com, the package's trusted publisher is
GitHub Actions, `me-no-code/vigueur-mcp`, workflow `release.yml`. A version published on npm can
never be published again, even after an unpublish: the npm job runs last, after the GitHub release,
and if it fails, re-run that job alone.
