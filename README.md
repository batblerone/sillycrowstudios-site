# PaperMod for Zola

A port of [hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod) to [Zola](https://www.getzola.org/)
**0.23+** (Tera 2), plus two additions:

- **Filterable blog** — a sidebar with full-text search, tag/category filters (match *any* or *all*),
  a year filter, sorting, live facet counts and pagination. Every view is a shareable URL
  (`/blog/?tags=rust,wasm&tags_match=all&sort=oldest`).
- **Projects gallery** — like [bevy.org/examples-webgpu](https://bevy.org/examples-webgpu/): a grid of
  cards grouped by category, each opening a page that runs the game in the browser (WebGPU or WebGL2),
  with a download progress bar, fullscreen, a WebGPU support check and a source browser that reads the
  project's `source.zip` right in the page.

```
.
├── zola.toml                 site config (theme options live under [extra])
├── content/
│   ├── _index.md             home page
│   ├── blog/                 posts (template = "blog.html")
│   ├── projects/             gallery (template = "projects.html")
│   │   └── games/orb-dodger/ demo Bevy game: index.md, game.js, game_bg.wasm, source.zip
│   ├── archives.md           template = "archives.html"
│   └── search.md             template = "search.html"
├── static/                   favicon etc.
├── themes/papermod/          the theme
└── tools/add-project.sh      builds a game (zip / folder / git URL) into a project page
```

## Quick start

```bash
# Zola 0.23 or newer: https://www.getzola.org/documentation/getting-started/installation/
zola serve          # http://127.0.0.1:1111
zola build          # output in public/
```

Set `base_url`, `title` and the `[extra]` values in `zola.toml`, replace the sample posts in
`content/blog/`, and you're done.

### Using only the theme

Copy `themes/papermod` into another Zola site, set `theme = "papermod"` and copy the
`[search]`, `[markdown]` and `[extra]` parts of this `zola.toml`. The templates you can select
with `template = "…"` are `blog.html`, `projects.html`, `project.html`, `archives.html` and
`search.html`. To customise a template, copy it from `themes/papermod/templates/` to your own
`templates/` folder with the same name — yours wins.

## Configuration

All theme options and their defaults are documented in `themes/papermod/theme.toml`. Any of them can
be overridden in `[extra]` in `zola.toml`. Options for posts (`show_toc`, `show_reading_time`,
`hide_meta`, `show_share_buttons`, `comments`, …) can also be set per page in the front matter's
`[extra]`.

Mapping from PaperMod's Hugo params:

| Hugo PaperMod (`params`)          | This port (`[extra]`)                            |
|-----------------------------------|--------------------------------------------------|
| `defaultTheme`, `disableThemeToggle` | `default_theme`, `disable_theme_toggle`        |
| `ShowReadingTime`, `ShowWordCount`   | `show_reading_time`, `show_word_count`          |
| `ShowShareButtons`, `ShareButtons`   | `show_share_buttons`, `share_buttons`           |
| `ShowPostNavLinks`, `ShowBreadCrumbs`| `show_post_nav_links`, `show_breadcrumbs`       |
| `ShowCodeCopyButtons`                | `show_code_copy_buttons`                        |
| `ShowToc`, `TocOpen`                 | `show_toc`, `toc_open`                          |
| `profileMode`                        | `profile_mode = { enabled, title, subtitle, image_url, buttons }` |
| `homeInfoParams`                     | `home_info = { title, content }`                |
| `socialIcons`                        | `social_icons = [{ name, url }]` (same icon names) |
| `label`                              | `label_text`, `label_icon`, `label_icon_height` |
| `editPost`                           | `edit_post = { url, text, append_file_path }`   |
| `cover` (front matter)               | `[extra.cover]` with `image`, `alt`, `caption`, `hidden`, `hidden_in_list`, `hidden_in_single` |
| `menu.main`                          | `menu = [{ name, url }]` (add `search = true` for the Alt+/ shortcut) |
| `mainSections`                       | `main_sections`                                  |
| `fuseOpts`                           | `search = { threshold, distance, limit }`       |

Hooks for your own code (create the file in your site's `templates/partials/`):
`extend_head.html`, `extend_footer.html`, `comments.html`.

### Shortcodes → components

Zola 0.23 replaced shortcodes with Tera components. PaperMod's shortcodes are available as:

```md
{{ <figure src="cat.jpg" caption="A cat" align="center" /> }}
{{ <youtube id="dQw4w9WgXcQ" /> }}
{{ <video src="clip.mp4" /> }}   {{ <audio src="song.mp3" /> }}
{% <collapse summary="Click to expand"> %} Hidden **markdown** {% </collapse> %}
{{ <project_link path="@/projects/games/orb-dodger/index.md" title="Orb Dodger" text="Dodge the falling orbs — runs in your browser with WebGPU" /> }}
```

> Because Zola 0.23 runs Tera over Markdown, literal `{{`, `{%` or `{#` in a post (for example in a
> Jinja code sample) must be wrapped in `{% raw %}…{% endraw %}`, or listed in
> `skip_content_templating` in `zola.toml`.

## The filterable blog

`content/blog/_index.md` uses `template = "blog.html"`. All posts are rendered into the page (so it
works without JavaScript and is crawlable); the sidebar then filters them in the browser.

- **Search** matches every word against the title, description, summary and tags, and — when
  `build_search_index = true` with `index_format = "fuse_json"` — the full text of each post.
- **Taxonomy filters**: one chip group per entry in `[extra.blog] filter_taxonomies`. Each group has
  an *Any*/*All* switch. Counts update to show how many posts each chip would give.
- **Year filter**, **sort** (newest, oldest, title, longest/shortest read), **pagination**
  (`page_size`), active-filter pills, `/` to focus search, and the state is stored in the URL.
- With `tag_links_to_filter = true`, tags under a post link to `/blog/?tags=<tag>`.

## The projects gallery

```
content/projects/_index.md               template = "projects.html"
content/projects/games/_index.md         template = "projects.html", page_template = "project.html"
content/projects/games/<slug>/index.md   one project (a page bundle)
```

Subsections are categories (sidebar + headings). A project bundle contains:

| File            | Purpose                                                            |
|-----------------|--------------------------------------------------------------------|
| `index.md`      | front matter + write-up shown under the player                     |
| `game.js`       | wasm-bindgen JS glue (`--target web`)                              |
| `game_bg.wasm`  | the game                                                           |
| `assets/`       | Bevy's assets — served next to the page, where Bevy looks for them |
| `source.zip`    | the source shown in the in-page code browser and offered for download |
| `cover.png`     | optional card thumbnail / player poster                            |

Project front matter (`[extra]`):

```toml
wasm = "game"                 # basename of game.js / game_bg.wasm
renderer = "webgpu"           # or "webgl2"
source_zip = "source.zip"
main_file = "src/main.rs"     # file opened first in the code browser
image = "cover.png"
repo = "https://github.com/you/game"
bevy_version = "0.20"
license = "MIT OR Apache-2.0"
aspect_ratio = "16 / 9"
controls = [["← → / A D", "Move"], ["Space", "Retry"]]
autoplay = false
```

Projects without `wasm` still get a card and a page (handy for source-only or external projects).

### Adding a game: `tools/add-project.sh`

```bash
tools/add-project.sh path/to/my-game.zip            # a zip of the project
tools/add-project.sh ../my-game --category tools     # a folder
tools/add-project.sh https://github.com/you/game     # a git repository
tools/add-project.sh game.zip --renderer webgl2 --title "My Game" --install-tools
```

It extracts the source, builds it for `wasm32-unknown-unknown` (adding `bevy/webgpu` for WebGPU
builds), runs `wasm-bindgen` and `wasm-opt`, copies `assets/`, packs a clean `source.zip`, and writes
`index.md` the first time (later runs keep your edits). Requirements: Rust with the
`wasm32-unknown-unknown` target, `wasm-bindgen-cli` matching the `wasm-bindgen` version in the
game's `Cargo.lock` (the script tells you the exact command, or pass `--install-tools`), `python3`
and `unzip`. Install [binaryen](https://github.com/WebAssembly/binaryen) (`npm i -g binaryen` works)
for much smaller downloads.

In your game, render into the page's canvas:

```rust
DefaultPlugins.set(WindowPlugin {
    primary_window: Some(Window {
        canvas: Some("#bevy".into()),
        fit_canvas_to_parent: true,
        prevent_default_event_handling: true,
        ..default()
    }),
    ..default()
})
```

If a game doesn't, the player moves the canvas Bevy appends to `<body>` into the frame anyway.

For smaller builds, trim Bevy's features and use `[profile.release] opt-level = "s"`, `lto = "thin"`, `codegen-units = 1`, `strip = true`.

### How the player works

The page only downloads the game when **Play** is pressed (the button shows the download size). The
player wraps `fetch` to show progress for the `.wasm` and every asset, filters winit's
"exceptions for control flow" error, resumes audio after the first input (Bevy's
`restart-audio-context.js`), offers fullscreen (`F`) and restart (Bevy can't be re-initialised in
the same page, so restart reloads with `?play=1`). It checks `navigator.gpu` and shows a warning when
a WebGPU build can't run.

### Hosting notes

- `.wasm` should be served as `application/wasm` (GitHub Pages, Netlify, Cloudflare Pages and
  `zola serve` all do). Enable gzip/brotli if your host allows it — WASM compresses very well.
- Cloudflare Pages limits single files to 25 MiB; keep `wasm-opt` on and Bevy features trimmed
  (`default-features = false, features = ["2d"]` or `["3d"]`).
- Multithreaded WASM builds need `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy`
  headers; regular Bevy builds don't.

## Credits

- [hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod) by adityatelange and nanxiaobei (MIT) —
  design, CSS, icons and search.
- [bevy-website](https://github.com/bevyengine/bevy-website) (MIT/Apache-2.0) — the examples page
  this gallery is modelled on, and `restart-audio-context.js`.
- [Fuse.js](https://www.fusejs.io/) (Apache-2.0), [JSZip](https://stuk.github.io/jszip/) (MIT),
  [highlight.js](https://highlightjs.org/) (BSD-3) — vendored in `themes/papermod/static/vendor/`.
