# Releasing SearchWeave

This repository now uses one umbrella release tag for all packages.

Tag format:

- `vX.Y.Z`

A single `vX.Y.Z` tag triggers:

- npm publish: `@searchweave/client` via `.github/workflows/publish-npm-client.yml`
- npm publish: `@searchweave/cli` via `.github/workflows/publish-npm-cli.yml`
- PyPI publish: `searchweave` via `.github/workflows/publish-py.yml`
- GitHub Release create/update via `.github/workflows/create-github-release.yml`
- GitHub Release asset uploads:
  - `searchweave-client-X.Y.Z.tgz`
  - `searchweave-cli-X.Y.Z.tgz`
  - `searchweave-X.Y.Z-py3-none-any.whl`
  - `searchweave-X.Y.Z.tar.gz`
  - `searchweave-cli-X.Y.Z-windows-x64.exe`
  - `searchweave-cli-X.Y.Z-windows-x86.exe`
  - `searchweave-cli-X.Y.Z-windows-x64.msi`
  - `searchweave-cli-X.Y.Z-windows-x86.msi`

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

## 3. Release by tag

Use semantic versions (`X.Y.Z`) and push one tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

This publishes all three packages and updates one GitHub Release (`vX.Y.Z`) with CLI `.exe` and `.msi` assets for both `x64` and `x86`.

## 4. What the workflows do

- `.github/workflows/publish-npm-client.yml`
  - Reads version from `v*` tag
  - Sets workspace package version without committing
  - Runs tests + `npm pack --dry-run`
  - Publishes `@searchweave/client`

- `.github/workflows/publish-npm-cli.yml`
  - Reads version from `v*` tag
  - Sets workspace package version without committing
  - Runs tests + `npm pack --dry-run`
  - Publishes `@searchweave/cli`

- `.github/workflows/publish-py.yml`
  - Reads version from `v*` tag
  - Rewrites `version = "..."` in `python/searchweave-py/pyproject.toml` for the run
  - Runs Python tests
  - Builds and publishes `searchweave` to PyPI

- `.github/workflows/create-github-release.yml`
  - Creates/updates one release for the same `v*` tag
  - Builds npm package tarballs (`@searchweave/client` and `@searchweave/cli`)
  - Builds python distribution files (`.whl` and source `.tar.gz`)
  - Builds Windows CLI executables (`x64` and `x86`)
  - Builds Windows MSI installers (`x64` and `x86`)
  - Uploads all built files as release assets

## 5. Verify release

1. Open GitHub Actions and confirm all publish workflows succeeded.
2. Check package registries:
   - npm: `@searchweave/client`
   - npm: `@searchweave/cli`
   - PyPI: `searchweave`
3. Check GitHub Release `vX.Y.Z` includes npm `.tgz`, python `.whl`/`.tar.gz`, and Windows `.exe`/`.msi` assets for both `x64` and `x86`.
4. Install-test quickly:

```bash
npm view @searchweave/client version
npm view @searchweave/cli version
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

- Windows x86 build is slower:
  - `@yao-pkg/pkg` may compile Node from source for `win-x86` targets when no prebuilt binary is available.
  - Expect the `build_windows_artifacts` job to take longer for x86 than x64.

## 7. Tag example

```bash
git tag v0.1.0
git push origin v0.1.0
```
