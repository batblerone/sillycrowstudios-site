#!/usr/bin/env bash
# Export a Godot 4 game for the web and add it to the projects gallery.
#
#   tools/add-godot-project.sh <project.zip | project-dir | git-url> [options]
#
# The result is a Zola page bundle:
#
#   content/projects/<category>/<slug>/
#     index.md        front matter + an embedded player (created once; your edits are kept)
#     play/           Godot's web export (game.html, .js, .wasm, .pck) and a
#                     click-to-play launcher (index.html), so nothing downloads
#                     until the visitor presses Play
#     source.zip      clean copy of the source for the in-page code browser
#     cover.png       if the project has cover.png / screenshot.png at its root
#
# The export is single-threaded (thread support off), so it runs on hosts that
# can't send cross-origin isolation headers, like GitHub Pages. That needs
# Godot 4.3 or newer. C# projects can't be exported to the web by Godot 4.
#
# Requirements: Godot 4.3+ with web export templates (or --install-tools),
# python3, unzip (for .zip input), git (for URL input).

set -euo pipefail

usage() {
  sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'
Options:
  --category NAME       Gallery category (subsection). Default: games
  --slug NAME           Folder/URL name. Default: the project name
  --title TEXT          Page title. Default: config/name from project.godot
  --preset NAME         Web export preset to use. Default: the first Web preset,
                        or a new one when the project has none
  --godot PATH          Godot editor binary. Default: $GODOT, godot4 or godot on PATH
  --godot-version V     Godot version for --install-tools, e.g. 4.5 or 4.5.1-stable.
                        Default: the version in project.godot (latest patch release)
  --install-tools       Download the Godot editor and web export templates if missing
  --repo URL            Repository link shown on the page
  --site DIR            Zola site root. Default: the folder containing tools/
  -h, --help            Show this help

Environment:
  GODOT_CACHE           Where --install-tools keeps the editor.
                        Default: ~/.cache/godot-web-export
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
CATEGORY="games"
SLUG=""
TITLE=""
PRESET=""
GODOT="${GODOT:-}"
GODOT_VERSION=""
INSTALL_TOOLS=0
REPO=""
SRC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --category) CATEGORY="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --godot) GODOT="$2"; shift 2 ;;
    --godot-version) GODOT_VERSION="$2"; shift 2 ;;
    --install-tools) INSTALL_TOOLS=1; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    --site) SITE="$(cd "$2" && pwd)"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; usage; exit 1 ;;
    *) SRC="$1"; shift ;;
  esac
done

[[ -n "$SRC" ]] || { usage; exit 1; }

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null || die "python3 is required"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------- get source
if [[ "$SRC" =~ ^(https?|git|ssh):// || "$SRC" =~ ^git@ ]]; then
  command -v git >/dev/null || die "git is required for repository URLs"
  say "Cloning $SRC"
  git clone --depth 1 "$SRC" "$WORK/src" >/dev/null
  PROJ="$WORK/src"
  [[ -n "$REPO" ]] || REPO="${SRC%.git}"
elif [[ -f "$SRC" && "$SRC" == *.zip ]]; then
  command -v unzip >/dev/null || die "unzip is required for .zip input"
  say "Extracting $(basename "$SRC")"
  unzip -q "$SRC" -d "$WORK/src"
  PROJ="$WORK/src"
elif [[ -d "$SRC" ]]; then
  PROJ="$(cd "$SRC" && pwd)"
else
  die "Source not found: $SRC"
fi

# Find project.godot (zips often wrap everything in one folder)
if [[ ! -f "$PROJ/project.godot" ]]; then
  CANDIDATE="$(find "$PROJ" -maxdepth 3 -name project.godot -not -path '*/.godot/*' | sort | head -n1)"
  [[ -n "$CANDIDATE" ]] || die "No project.godot found in $SRC"
  PROJ="$(dirname "$CANDIDATE")"
fi
say "Project: $PROJ"

if find "$PROJ" -maxdepth 2 -name '*.csproj' | grep -q .; then
  die "This is a C# (.NET) project. Godot 4 can't export C# projects to the web yet."
fi

# ---------------------------------------------------------------- metadata
read_meta() {
  python3 - "$PROJ" "$1" <<'PY'
import os, re, sys
proj, key = sys.argv[1], sys.argv[2]
txt = open(os.path.join(proj, "project.godot"), encoding="utf-8").read()

def setting(name):
    m = re.search(r'^' + re.escape(name) + r'\s*=\s*"((?:[^"\\]|\\.)*)"', txt, re.M)
    return m.group(1).encode().decode("unicode_escape") if m else ""

def main_script():
    scene = setting("run/main_scene")
    if scene.startswith("uid://"):
        # Godot 4.4+ may store the main scene as a UID; find the scene that has it.
        uid = scene
        scene = ""
        for d, dirs, files in os.walk(proj):
            dirs[:] = [x for x in dirs if not x.startswith(".")]
            for f in files:
                if f.endswith(".tscn"):
                    head = open(os.path.join(d, f), encoding="utf-8", errors="ignore").readline()
                    if f'uid="{uid}"' in head:
                        scene = "res://" + os.path.relpath(os.path.join(d, f), proj)
    if scene.startswith("res://"):
        p = os.path.join(proj, scene[6:])
        if os.path.isfile(p):
            s = open(p, encoding="utf-8", errors="ignore").read()
            m = re.search(r'type="Script"[^\]]*path="res://([^"]+\.gd)"', s) or \
                re.search(r'path="res://([^"]+\.gd)"[^\]]*type="Script"', s)
            if m and os.path.isfile(os.path.join(proj, m.group(1))):
                return m.group(1)
    for d, dirs, files in sorted(os.walk(proj)):
        dirs[:] = sorted(x for x in dirs if not x.startswith(".") and x != "addons")
        for f in sorted(files):
            if f.endswith(".gd"):
                return os.path.relpath(os.path.join(d, f), proj)
    return "project.godot"

features = re.search(r'^config/features\s*=\s*PackedStringArray\(([^)]*)\)', txt, re.M)
version = ""
if features:
    for v in re.findall(r'"([^"]+)"', features.group(1)):
        if re.fullmatch(r"\d+\.\d+", v):
            version = v

vals = {
    "name": setting("config/name"),
    "description": setting("config/description"),
    "version": version,
    "main_file": main_script(),
}
print(vals[key])
PY
}

NAME="$(read_meta name)"
DESCRIPTION="$(read_meta description)"
PROJECT_VERSION="$(read_meta version)"
MAIN_FILE="$(read_meta main_file)"

[[ -n "$NAME" ]] || NAME="$(basename "$PROJ")"
[[ -n "$TITLE" ]] || TITLE="$NAME"
[[ -n "$SLUG" ]] || SLUG="$NAME"
SLUG="$(echo "$SLUG" | tr '[:upper:]_ ' '[:lower:]--' | tr -cd 'a-z0-9-')"
[[ -n "$SLUG" ]] || die "Could not derive a slug; pass --slug"

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

# ---------------------------------------------------------------- tools
# Turn "4.5", "4.5.1" or "4.5.1-stable" into a full release tag like "4.5.1-stable".
resolve_release() {
  local want="$1"
  if [[ "$want" == *-* ]]; then echo "$want"; return; fi
  command -v git >/dev/null || die "git is needed to look up Godot releases; pass --godot-version X.Y.Z-stable"
  local tags
  tags="$(git ls-remote --tags https://github.com/godotengine/godot.git 2>/dev/null \
    | sed -n 's#.*refs/tags/\([0-9][0-9.]*-stable\)$#\1#p' | sort -V)"
  local match
  match="$(echo "$tags" | grep -E "^${want//./\\.}(\.[0-9]+)?-stable$" | tail -n1 || true)"
  [[ -n "$match" ]] || die "No stable Godot release matches $want"
  echo "$match"
}

godot_templates_dir() {
  # The editor's version string, e.g. "4.5.1.stable.official.abc123" -> 4.5.1.stable
  local v
  v="$("$1" --headless --version 2>/dev/null | tail -n1 | tr -d '\r')"
  v="$(echo "$v" | cut -d. -f1-4)"
  # Releases without a patch number print "4.5.stable.official..."
  [[ "$(echo "$v" | cut -d. -f3)" =~ ^[0-9]+$ ]] || v="$(echo "$v" | cut -d. -f1-3)"
  echo "${XDG_DATA_HOME:-$HOME/.local/share}/godot/export_templates/$v"
}

install_godot() {
  local release="$1"
  local cache="${GODOT_CACHE:-$HOME/.cache/godot-web-export}/$release"
  local base="https://github.com/godotengine/godot/releases/download/$release"
  local bin="$cache/Godot_v${release}_linux.x86_64"
  mkdir -p "$cache"
  if [[ ! -x "$bin" ]]; then
    say "Downloading Godot $release"
    curl -fsSL -o "$WORK/godot.zip" "$base/Godot_v${release}_linux.x86_64.zip"
    unzip -q -o "$WORK/godot.zip" -d "$cache"
    chmod +x "$bin"
  fi
  GODOT="$bin"
  local tdir
  tdir="$(godot_templates_dir "$GODOT")"
  if ! ls "$tdir"/web_nothreads_release.zip >/dev/null 2>&1; then
    say "Downloading web export templates for Godot $release (large download, only the web templates are kept)"
    curl -fsSL -o "$WORK/templates.tpz" "$base/Godot_v${release}_export_templates.tpz"
    mkdir -p "$tdir"
    unzip -q -o -j "$WORK/templates.tpz" 'templates/web*' 'templates/version.txt' -d "$tdir"
    rm -f "$WORK/templates.tpz"
  fi
}

if [[ -z "$GODOT" ]]; then
  for g in godot4 godot; do command -v "$g" >/dev/null && { GODOT="$(command -v "$g")"; break; }; done
fi

if [[ $INSTALL_TOOLS -eq 1 ]]; then
  WANT="${GODOT_VERSION:-$PROJECT_VERSION}"
  [[ -n "$WANT" ]] || die "Couldn't read the Godot version from project.godot; pass --godot-version"
  RELEASE="$(resolve_release "$WANT")"
  if [[ -n "$GODOT" ]] && "$GODOT" --headless --version 2>/dev/null | tail -n1 | grep -q "^${RELEASE%-stable}\.stable"; then
    say "Using $GODOT"
  else
    install_godot "$RELEASE"
  fi
fi

[[ -n "$GODOT" ]] || die "Godot not found. Pass --godot PATH, set GODOT, or use --install-tools"
GODOT_FULL="$("$GODOT" --headless --version 2>/dev/null | tail -n1 | tr -d '\r')"
GODOT_SHORT="$(echo "$GODOT_FULL" | cut -d. -f1-2)"
say "Godot $GODOT_FULL"
version_ge "$GODOT_SHORT" "4.3" || die "Godot 4.3 or newer is needed for single-threaded web exports (found $GODOT_SHORT)"
if [[ -n "$PROJECT_VERSION" ]] && ! version_ge "$GODOT_SHORT" "$PROJECT_VERSION"; then
  warn "The project was made with Godot $PROJECT_VERSION but this is Godot $GODOT_SHORT"
fi

TEMPLATES="$(godot_templates_dir "$GODOT")"
ls "$TEMPLATES"/web_nothreads_release.zip >/dev/null 2>&1 \
  || die "Web export templates not found in $TEMPLATES (install them from the editor, or use --install-tools)"

# ---------------------------------------------------------------- export
# Export from a copy so the source project is never modified.
say "Preparing a clean copy of the project"
mkdir -p "$WORK/proj"
(cd "$PROJ" && tar --exclude=./.godot --exclude=./.git -cf - .) | (cd "$WORK/proj" && tar -xf -)

HAS_EXTENSIONS=0
find "$WORK/proj" -name '*.gdextension' -not -path '*/.godot/*' | grep -q . && HAS_EXTENSIONS=1

PRESET="$(python3 - "$WORK/proj/export_presets.cfg" "$PRESET" "$HAS_EXTENSIONS" <<'PY'
import os, re, sys
path, wanted, has_ext = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
text = open(path, encoding="utf-8").read() if os.path.exists(path) else ""

# Split into [section] blocks, keeping their order.
blocks = []
for part in re.split(r'(?m)^(?=\[)', text):
    if not part.strip():
        continue
    m = re.match(r'\[([^\]]+)\]', part)
    blocks.append([m.group(1) if m else "", part.rstrip("\n") + "\n"])

def get(body, key):
    m = re.search(r'^' + re.escape(key) + r'\s*=\s*"([^"]*)"', body, re.M)
    return m.group(1) if m else None

def put(body, key, value):
    line = f"{key}={value}"
    if re.search(r'^' + re.escape(key) + r'\s*=', body, re.M):
        return re.sub(r'(?m)^' + re.escape(key) + r'\s*=.*$', line, body)
    return body.rstrip("\n") + "\n" + line + "\n"

index = None
for name, body in blocks:
    m = re.fullmatch(r'preset\.(\d+)', name)
    if m and get(body, "platform") == "Web" and (not wanted or get(body, "name") == wanted):
        index = m.group(1)
        break

if index is None:
    if wanted and any(get(b, "name") == wanted for _, b in blocks):
        sys.exit(f"Preset '{wanted}' exists but is not a Web preset")
    used = [int(m.group(1)) for n, _ in blocks if (m := re.fullmatch(r'preset\.(\d+)', n))]
    index = str(max(used) + 1 if used else 0)
    name = wanted or "Web"
    blocks.append([f"preset.{index}", f'''[preset.{index}]

name="{name}"
platform="Web"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path=""
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false
'''])
    blocks.append([f"preset.{index}.options", f'''[preset.{index}.options]

custom_template/debug=""
custom_template/release=""
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell=""
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
'''])
    print(f"Added a '{name}' web export preset", file=sys.stderr)

# Single-threaded build: works without cross-origin isolation headers (GitHub Pages).
for i, (name, body) in enumerate(blocks):
    if name == f"preset.{index}.options":
        body = put(body, "variant/thread_support", "false")
        if has_ext:
            body = put(body, "variant/extensions_support", "true")
        blocks[i][1] = body
    if name == f"preset.{index}":
        preset_name = get(body, "name")

open(path, "w", encoding="utf-8").write("\n".join(b for _, b in blocks))
print(preset_name)
PY
)"
say "Using export preset \"$PRESET\""

say "Importing project assets"
"$GODOT" --headless --path "$WORK/proj" --import >"$WORK/import.log" 2>&1 || {
  tail -n 40 "$WORK/import.log" >&2
  die "Godot failed to import the project"
}

say "Exporting for the web"
mkdir -p "$WORK/out"
"$GODOT" --headless --path "$WORK/proj" --export-release "$PRESET" "$WORK/out/game.html" 2>&1 | tee "$WORK/export.log" || true
for f in game.html game.js game.wasm game.pck; do
  [[ -f "$WORK/out/$f" ]] || { tail -n 40 "$WORK/export.log" >&2; die "Export failed: $f was not produced"; }
done

# ---------------------------------------------------------------- bundle
DEST="$SITE/content/projects/$CATEGORY/$SLUG"
mkdir -p "$DEST"
rm -rf "$DEST/play"
mkdir -p "$DEST/play"
cp -R "$WORK/out/." "$DEST/play/"

COVER=""
for c in cover.png cover.jpg screenshot.png screenshot.jpg; do
  if [[ -f "$PROJ/$c" ]]; then cp "$PROJ/$c" "$DEST/cover.${c##*.}"; COVER="cover.${c##*.}"; break; fi
done
[[ -z "$COVER" && -f "$DEST/cover.png" ]] && COVER="cover.png"
[[ -z "$COVER" && -f "$DEST/cover.jpg" ]] && COVER="cover.jpg"

POSTER=""
if [[ -n "$COVER" ]]; then POSTER="../$COVER"; elif [[ -f "$DEST/play/game.png" ]]; then POSTER="game.png"; fi
DOWNLOAD_MB="$(python3 -c "import os,sys; print(round(sum(os.path.getsize(os.path.join(sys.argv[1], f)) for f in ('game.wasm','game.pck','game.js')) / 1048576, 1))" "$DEST/play")"

say "Writing the click-to-play launcher"
python3 - "$DEST/play/index.html" "$TITLE" "$POSTER" "$DOWNLOAD_MB" <<'PY'
import html, sys
out, title, poster, size = sys.argv[1:]
t = html.escape(title)
# A cover image fills the frame; Godot's boot splash (game.png) is shown whole.
fit = "contain" if poster == "game.png" else "cover"
bg = f"background-image:url('{html.escape(poster)}'); background-size:{fit};" if poster else ""
open(out, "w", encoding="utf-8").write(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #000; color: #fff;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
  button {{ all: unset; box-sizing: border-box; cursor: pointer; position: fixed; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
    {bg} background-repeat: no-repeat; background-position: center; }}
  button::before {{ content: ""; position: absolute; inset: 0; background: rgba(0, 0, 0, .45); }}
  .icon {{ position: relative; width: 76px; height: 76px; border-radius: 50%; background: rgba(255, 255, 255, .95);
    display: flex; align-items: center; justify-content: center; transition: transform .15s; }}
  button:hover .icon, button:focus-visible .icon {{ transform: scale(1.08); }}
  .icon svg {{ margin-left: 5px; fill: #111; }}
  .label {{ position: relative; text-align: center; line-height: 1.4; text-shadow: 0 1px 3px #000; }}
  .label span {{ display: block; font-size: 13px; opacity: .85; }}
</style>
</head>
<body>
<button type="button" id="play" aria-label="Play {t}">
  <span class="icon"><svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>
  <span class="label"><strong>Click to play</strong><span>Runs in your browser with WebGL2 &middot; {size} MB download</span></span>
</button>
<script>
  // The Godot export only downloads once Play is pressed. ?play=1 skips this screen.
  var go = function () {{ location.replace("game.html"); }};
  document.getElementById("play").addEventListener("click", go);
  if (/[?&]play=1/.test(location.search)) go();
</script>
</body>
</html>
""")
PY

say "Packing source.zip"
python3 - "$PROJ" "$DEST/source.zip" "$SLUG" <<'PY'
import os, sys, zipfile
root, out, top = sys.argv[1], sys.argv[2], sys.argv[3]
skip_dirs = {".godot", ".git", ".import", "build", "builds", "export", "exports", "node_modules", "target", ".idea", ".vscode"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in skip_dirs)
        for f in sorted(files):
            if f in (".DS_Store",):
                continue
            p = os.path.join(d, f)
            z.write(p, os.path.join(top, os.path.relpath(p, root)))
PY

# Category section
CAT_INDEX="$SITE/content/projects/$CATEGORY/_index.md"
if [[ ! -f "$CAT_INDEX" ]]; then
  CAT_TITLE="$(echo "$CATEGORY" | tr '_-' '  ' | awk '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}}1')"
  cat > "$CAT_INDEX" <<EOF
+++
title = "$CAT_TITLE"
template = "projects.html"
page_template = "project.html"
sort_by = "date"
+++
EOF
  say "Created category $CAT_INDEX"
fi

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
html_esc() { printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g'; }

INDEX="$DEST/index.md"
if [[ ! -f "$INDEX" ]]; then
  {
    echo "+++"
    echo "title = \"$(esc "$TITLE")\""
    [[ -n "$DESCRIPTION" ]] && echo "description = \"$(esc "$DESCRIPTION")\""
    echo "date = $(date +%Y-%m-%d)"
    echo ""
    echo "[taxonomies]"
    echo "tags = [\"godot\", \"webgl2\"]"
    echo ""
    echo "[extra]"
    echo "source_zip = \"source.zip\""
    echo "main_file = \"$(esc "$MAIN_FILE")\""
    [[ -n "$COVER" ]] && echo "image = \"$COVER\""
    [[ -n "$REPO" ]] && echo "repo = \"$(esc "$REPO")\""
    echo "godot_version = \"$GODOT_SHORT\""
    echo "# controls = [[\"← → / A D\", \"Move\"], [\"Space\", \"Jump\"]]"
    echo "+++"
    echo ""
    echo "<div class=\"video-embed\"><iframe src=\"play/index.html\" title=\"$(html_esc "$TITLE")\" allow=\"fullscreen; autoplay; gamepad\"></iframe></div>"
    echo ""
    echo "[Open the game in its own window](play/index.html?play=1)"
    echo ""
    echo "Describe your project here. This text appears between the controls and the source browser."
  } > "$INDEX"
  say "Created $INDEX"
else
  say "Kept existing $INDEX (front matter not modified)"
fi

SIZE=$(du -sh "$DEST" | cut -f1)
say "Done: content/projects/$CATEGORY/$SLUG ($SIZE)"
echo "    Preview with: zola serve   →   /projects/$CATEGORY/$SLUG/"
