# Publishing

The site is built with Zola and hosted on GitHub Pages at <https://sillycrow.ca>, the same way
[bevy-website](https://github.com/bevyengine/bevy-website) is: a workflow builds the site and
force-pushes the output to the `gh-pages` branch.

| Workflow | When it runs | What it does |
|---|---|---|
| `deploy.yml` | push to `main`, manual, or after a game is published | `zola build` → `gh-pages` branch |
| `ci.yml` | pull requests | checks the site builds, the scripts parse, and no file is over 100 MB |
| `publish-game.yml` | manual, or a `publish-game` repository_dispatch | builds a Bevy or Godot game for the web, adds its page, deploys |

## One-time setup

1. Push this folder to a GitHub repository with `main` as the default branch.
2. **Settings → Actions → General → Workflow permissions**: choose *Read and write permissions*,
   and tick *Allow GitHub Actions to create and approve pull requests* if you want the
   pull-request publish mode.
3. Push once so `deploy.yml` creates the `gh-pages` branch.
4. **Settings → Pages**: *Deploy from a branch*, branch `gh-pages`, folder `/ (root)`.
   Set the custom domain to `sillycrow.ca` and turn on *Enforce HTTPS* once the certificate is ready.
   `static/CNAME` keeps the domain set on every deploy.
5. At your DNS provider, point `sillycrow.ca` at GitHub Pages: `A` records to `185.199.108.153`,
   `185.199.109.153`, `185.199.110.153` and `185.199.111.153` (and optionally a `www` `CNAME` to
   `<your-user>.github.io`).

## Publishing a game

**Actions → Publish Game → Run workflow**, then fill in:

| Input | Example | Notes |
|---|---|---|
| engine | `bevy` / `godot` | |
| repository | `batblerone/rustypong` | `owner/name` on GitHub, or any git URL |
| ref | `v1.0`, a branch or commit | empty = default branch |
| path | `games/pong` | folder with `Cargo.toml` / `project.godot` inside the repo |
| title | `Rusty Pong` | empty = crate name / Godot project name |
| category | `games` | folder under `content/projects/` |
| renderer | `webgpu` / `webgl2` | Bevy only; Godot always uses WebGL2 |
| options | `--slug pong --bin pong` | passed to the build script (see below) |
| pre_build | `./build-web-lib.sh` | shell command run in the game folder first |
| publish | `deploy` / `pull-request` | commit and deploy now, or open a PR to review |

The page lands in `content/projects/<category>/<slug>/`. `index.md` is only written the first time,
so edit the description and controls there freely; publishing again only replaces the build.
The built page is also attached to each run as an artifact.

- **Bevy** uses `tools/add-project.sh` (options: `--slug`, `--bin`, `--example`, `--features`,
  `--profile`, `--no-opt`, `--no-assets`). The game should render into `#bevy`, see the README.
- **Godot** uses `tools/add-godot-project.sh` (options: `--slug`, `--preset`, `--godot-version`).
  It needs Godot 4.3 or newer and GDScript (Godot 4 can't export C# to the web). The export is
  single-threaded so it runs on GitHub Pages, which can't send cross-origin isolation headers.
  The Godot version is read from `project.godot` and the latest patch release is used. If the
  project has no Web export preset, one is added. The game runs in an embedded frame on its page,
  with a click-to-play screen, so nothing downloads until a visitor presses Play.
  Projects using godot-rust (GDExtension) need their library built for the web in `pre_build`.

Both scripts also work locally, e.g. `tools/add-godot-project.sh ../my-game --install-tools`.

### Publishing from a game's repository

Add a token secret (a fine-grained PAT with *Contents: read and write* on the website repo) to the
game repository, then trigger a publish from its own workflow, e.g. on a release:

```yaml
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: |
          gh api repos/<you>/<website-repo>/dispatches \
            -f event_type=publish-game \
            -f 'client_payload[engine]=bevy' \
            -f "client_payload[repository]=$GITHUB_REPOSITORY" \
            -f "client_payload[ref]=$GITHUB_REF_NAME"
        env:
          GH_TOKEN: ${{ secrets.WEBSITE_TOKEN }}
```

`client_payload` accepts the same names as the inputs above.

### Private game repositories

Add a secret `GAME_REPO_TOKEN` to the website repository: a fine-grained token with
*Contents: read* on the game repositories.

## Size limits

GitHub rejects files over 100 MB and a Pages site should stay under 1 GB. Godot's web engine is
about 37 MB per game (around 9 MB compressed over the wire); Bevy builds depend on the features
used. Trim Bevy features and keep `wasm-opt` on to keep downloads small.
