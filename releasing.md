# Releasing SearchWeave

This repository publishes three packages from Git tags:

- npm: `@searchweave/client` via `.github/workflows/publish-npm-client.yml`
- npm: `@searchweave/cli` via `.github/workflows/publish-npm-cli.yml`
- PyPI: `searchweave` via `.github/workflows/publish-py.yml`

It also auto-creates a GitHub Release entry for the same tags via:

- `.github/workflows/create-github-release.yml`

## 1. One-time setup

### 1.1 npm trusted publishing

Do this for each npm package (`@searchweave/client` and `@searchweave/cli`):

1. Go to npm package settings.
2. Enable trusted publishing for this GitHub repository.
3. Ensure OIDC/trusted publisher is configured for the matching workflow file:
   - `.github/workflows/publish-npm-client.yml` for `@searchweave/client`
   - `.github/workflows/publish-npm-cli.yml` for `@searchweave/cli`
4. Ensure package visibility/access is allowed for public publish.

### 1.2 PyPI trusted publishing

1. Create the `searchweave` project on PyPI if it does not exist yet.
2. In PyPI project settings, add a trusted publisher for this repository.
3. Set workflow path to `.github/workflows/publish-py.yml`.
4. Save settings.

## 2. Pre-release checks

Run these before tagging:

```bash
npm ci
npm run test:workspaces
npm run pack:check
```

If Python is installed locally, also run:

```bash
npm run test:python
python -m pip install --upgrade build
python -m build python/searchweave-py
```

## 3. Release by tags

Use semantic versions (`X.Y.Z`).

### 3.1 Release `@searchweave/client`

```bash
git tag npm-client-vX.Y.Z
git push origin npm-client-vX.Y.Z
```

This also creates/updates a GitHub Release for `npm-client-vX.Y.Z`.

### 3.2 Release `@searchweave/cli`

```bash
git tag npm-cli-vX.Y.Z
git push origin npm-cli-vX.Y.Z
```

This also creates/updates a GitHub Release for `npm-cli-vX.Y.Z`.

### 3.3 Release `searchweave` (PyPI)

```bash
git tag py-vX.Y.Z
git push origin py-vX.Y.Z
```

This also creates/updates a GitHub Release for `py-vX.Y.Z`.

## 4. What the workflows do

- npm workflows:
  - Read version from tag (`npm-client-v*` or `npm-cli-v*`)
  - Set package version in workspace package without committing
  - Run package tests
  - Run `npm pack --dry-run`
  - Publish with `npm publish --provenance --access public`

- PyPI workflow:
  - Reads version from `py-v*` tag
  - Rewrites `version = "..."` in `python/searchweave-py/pyproject.toml` for the run
  - Runs Python tests
  - Builds with `python -m build python/searchweave-py`
  - Publishes via `pypa/gh-action-pypi-publish`

## 5. Verify release

1. Open GitHub Actions and confirm the publish workflow run succeeded.
2. Check package registries:
   - npm: `@searchweave/client` and/or `@searchweave/cli`
   - PyPI: `searchweave`
3. Install-test quickly:

```bash
npm view @searchweave/client version
npm view @searchweave/cli version
```

```bash
python -m pip index versions searchweave
```

## 6. Troubleshooting

- Version already exists:
  - npm and PyPI versions are immutable.
  - Bump to a new version and create a new tag.

- Wrong tag pushed:
  - If publish has not happened yet, delete the tag and push the corrected one.
  - If already published, publish a new fixed version.

- Trusted publishing/OIDC errors:
  - Recheck trusted publisher settings on npm/PyPI:
    - repository owner/name
    - workflow filename
    - branch/tag permissions in GitHub repo settings

## 7. Tag examples

```bash
git tag npm-client-v0.1.0
git tag npm-cli-v0.1.0
git tag py-v0.1.0
git push origin npm-client-v0.1.0 npm-cli-v0.1.0 py-v0.1.0
```
