#!/usr/bin/env bash
# Build a Rust/Bevy game for the web and add it to the projects gallery.
#
#   tools/add-project.sh <source.zip | project-dir | git-url> [options]
#
# The result is a Zola page bundle:
#
#   content/projects/<category>/<slug>/
#     index.md        front matter (created once; your edits are kept on rebuilds)
#     game.js         wasm-bindgen JS glue  (--target web)
#     game_bg.wasm    the game
#     assets/         copied from the project, Bevy loads them relative to the page
#     source.zip      clean copy of the source for the in-page code browser
#     cover.png       if the project has cover.png / screenshot.png at its root
#
# Requirements: cargo + rustup target wasm32-unknown-unknown, wasm-bindgen-cli
# (same version as the wasm-bindgen crate in Cargo.lock), python3, unzip (for .zip
# input), git (for URL input). wasm-opt (binaryen) is used when available.

set -euo pipefail

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'
Options:
  --category NAME     Gallery category (subsection). Default: games
  --slug NAME         Folder/URL name. Default: the crate name
  --title TEXT        Page title. Default: crate name in Title Case
  --renderer R        webgpu (default) or webgl2
  --bin NAME          Binary target to build when the crate has several
  --example NAME      Build an example instead of a binary
  --features LIST     Extra cargo features (comma separated)
  --profile NAME      Cargo profile. Default: release
  --no-opt            Skip wasm-opt
  --no-assets         Don't copy the assets/ folder
  --install-tools     Install the matching wasm-bindgen-cli automatically
  --site DIR          Zola site root. Default: the folder containing tools/
  -h, --help          Show this help

Environment:
  CARGO_EXTRA_ARGS    Extra arguments passed to `cargo build`
  WASM_OPT_FLAGS      Flags for wasm-opt. Default: -Oz plus the wasm features Rust enables by default
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
CATEGORY="games"
SLUG=""
TITLE=""
RENDERER="webgpu"
BIN=""
EXAMPLE=""
FEATURES=""
PROFILE="release"
OPT=1
COPY_ASSETS=1
INSTALL_TOOLS=0
SRC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --category) CATEGORY="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --renderer) RENDERER="$2"; shift 2 ;;
    --bin) BIN="$2"; shift 2 ;;
    --example) EXAMPLE="$2"; shift 2 ;;
    --features) FEATURES="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --no-opt) OPT=0; shift ;;
    --no-assets) COPY_ASSETS=0; shift ;;
    --install-tools) INSTALL_TOOLS=1; shift ;;
    --site) SITE="$(cd "$2" && pwd)"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; usage; exit 1 ;;
    *) SRC="$1"; shift ;;
  esac
done

[[ -n "$SRC" ]] || { usage; exit 1; }
[[ "$RENDERER" == "webgpu" || "$RENDERER" == "webgl2" ]] || { echo "--renderer must be webgpu or webgl2" >&2; exit 1; }

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v cargo >/dev/null || die "cargo not found — install Rust from https://rustup.rs"
command -v python3 >/dev/null || die "python3 is required"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------- get source
if [[ "$SRC" =~ ^(https?|git|ssh):// || "$SRC" =~ ^git@ ]]; then
  command -v git >/dev/null || die "git is required for repository URLs"
  say "Cloning $SRC"
  git clone --depth 1 "$SRC" "$WORK/src" >/dev/null
  PROJ="$WORK/src"
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

# Find Cargo.toml (zips often wrap everything in one folder)
if [[ ! -f "$PROJ/Cargo.toml" ]]; then
  CANDIDATE="$(find "$PROJ" -maxdepth 2 -name Cargo.toml -not -path '*/target/*' | head -n1)"
  [[ -n "$CANDIDATE" ]] || die "No Cargo.toml found in $SRC"
  PROJ="$(dirname "$CANDIDATE")"
fi
say "Project: $PROJ"

# ---------------------------------------------------------------- metadata
META_JSON="$WORK/meta.json"
(cd "$PROJ" && cargo metadata --format-version 1 --no-deps 2>/dev/null) > "$META_JSON" \
  || (cd "$PROJ" && cargo metadata --format-version 1 --no-deps) > "$META_JSON"

read_meta() {
  python3 - "$META_JSON" "$PROJ" "$1" <<'PY'
import json, sys, os
meta = json.load(open(sys.argv[1]))
proj = os.path.realpath(sys.argv[2])
key = sys.argv[3]
pkgs = meta["packages"]
pkg = next((p for p in pkgs if os.path.realpath(os.path.dirname(p["manifest_path"])) == proj), pkgs[0])
bins = [t["name"] for t in pkg["targets"] if "bin" in t["kind"]]
bevy = next((d["req"] for d in pkg["dependencies"] if d["name"] == "bevy"), "")
bevy = bevy.lstrip("^=~ ")
vals = {
  "name": pkg["name"],
  "description": pkg.get("description") or "",
  "license": pkg.get("license") or "",
  "repository": pkg.get("repository") or pkg.get("homepage") or "",
  "bins": " ".join(bins),
  "bevy": ".".join(bevy.split(".")[:2]) if bevy else "",
  "target_dir": meta["target_directory"],
}
print(vals[key])
PY
}

NAME="$(read_meta name)"
DESCRIPTION="$(read_meta description)"
LICENSE="$(read_meta license)"
REPO="$(read_meta repository)"
BINS="$(read_meta bins)"
BEVY_VERSION="$(read_meta bevy)"
TARGET_DIR="$(read_meta target_dir)"

[[ -n "$SLUG" ]] || SLUG="$NAME"
SLUG="$(echo "$SLUG" | tr '[:upper:]_ ' '[:lower:]--')"
[[ -n "$TITLE" ]] || TITLE="$(echo "$NAME" | tr '_-' '  ' | awk '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}}1')"

if [[ -z "$EXAMPLE" && -z "$BIN" ]]; then
  # shellcheck disable=SC2206
  arr=($BINS)
  if [[ ${#arr[@]} -eq 0 ]]; then die "No binary target found; use --example NAME"; fi
  if [[ ${#arr[@]} -gt 1 ]]; then
    for b in "${arr[@]}"; do [[ "$b" == "$NAME" ]] && BIN="$b"; done
    [[ -n "$BIN" ]] || die "Several binaries (${arr[*]}); pick one with --bin"
  else
    BIN="${arr[0]}"
  fi
fi
ARTIFACT="${EXAMPLE:-$BIN}"

# ---------------------------------------------------------------- tools
if command -v rustup >/dev/null; then
  if ! rustup target list --installed 2>/dev/null | grep -q '^wasm32-unknown-unknown$'; then
    say "Adding the wasm32-unknown-unknown target"
    rustup target add wasm32-unknown-unknown || warn "Could not add the wasm32 target automatically"
  fi
fi

(cd "$PROJ" && [[ -f Cargo.lock ]] || cargo generate-lockfile >/dev/null 2>&1) || true
LOCK="$PROJ/Cargo.lock"
[[ -f "$LOCK" ]] || LOCK="$(dirname "$TARGET_DIR")/Cargo.lock"
WBG_VERSION="$(python3 - "$LOCK" <<'PY'
import sys, re
try:
    txt = open(sys.argv[1]).read()
except OSError:
    sys.exit(0)
m = re.search(r'name = "wasm-bindgen"\nversion = "([^"]+)"', txt)
print(m.group(1) if m else "")
PY
)"

if [[ -n "$WBG_VERSION" ]]; then
  HAVE="$(wasm-bindgen --version 2>/dev/null | awk '{print $2}' || true)"
  if [[ "$HAVE" != "$WBG_VERSION" ]]; then
    if [[ $INSTALL_TOOLS -eq 1 ]]; then
      say "Installing wasm-bindgen-cli $WBG_VERSION"
      cargo install wasm-bindgen-cli --version "$WBG_VERSION" --locked
    else
      die "wasm-bindgen-cli $WBG_VERSION is required (found: ${HAVE:-none}).
       Run: cargo install wasm-bindgen-cli --version $WBG_VERSION --locked
       or re-run this script with --install-tools"
    fi
  fi
else
  command -v wasm-bindgen >/dev/null || die "wasm-bindgen-cli not found: cargo install wasm-bindgen-cli"
fi

# ---------------------------------------------------------------- build
FEATURE_ARGS=()
ALL_FEATURES="$FEATURES"
if [[ "$RENDERER" == "webgpu" && -n "$BEVY_VERSION" ]]; then
  ALL_FEATURES="${ALL_FEATURES:+$ALL_FEATURES,}bevy/webgpu"
fi
[[ -n "$ALL_FEATURES" ]] && FEATURE_ARGS=(--features "$ALL_FEATURES")

TARGET_ARGS=(--bin "$BIN")
[[ -n "$EXAMPLE" ]] && TARGET_ARGS=(--example "$EXAMPLE")

# getrandom 0.3+ needs an explicit backend on the web
export RUSTFLAGS="${RUSTFLAGS:-} --cfg getrandom_backend=\"wasm_js\""

say "Building $ARTIFACT ($RENDERER, profile $PROFILE)"
# shellcheck disable=SC2086
(cd "$PROJ" && cargo build --profile "$PROFILE" --target wasm32-unknown-unknown \
  "${TARGET_ARGS[@]}" "${FEATURE_ARGS[@]}" ${CARGO_EXTRA_ARGS:-})

PROFILE_DIR="$PROFILE"
[[ "$PROFILE" == "dev" ]] && PROFILE_DIR="debug"
WASM_IN="$TARGET_DIR/wasm32-unknown-unknown/$PROFILE_DIR/$ARTIFACT.wasm"
[[ -n "$EXAMPLE" ]] && WASM_IN="$TARGET_DIR/wasm32-unknown-unknown/$PROFILE_DIR/examples/$ARTIFACT.wasm"
[[ -f "$WASM_IN" ]] || die "Build output not found: $WASM_IN"

# ---------------------------------------------------------------- bundle
DEST="$SITE/content/projects/$CATEGORY/$SLUG"
mkdir -p "$DEST"

say "Generating JS bindings"
wasm-bindgen --target web --no-typescript --out-dir "$DEST" --out-name game "$WASM_IN"

if [[ $OPT -eq 1 ]]; then
  if command -v wasm-opt >/dev/null; then
    say "Optimizing with wasm-opt (this can take a minute)"
    BEFORE=$(wc -c < "$DEST/game_bg.wasm")
    # shellcheck disable=SC2086
    wasm-opt ${WASM_OPT_FLAGS:--Oz --strip-debug --strip-producers --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue} -o "$DEST/game_bg.opt.wasm" "$DEST/game_bg.wasm" \
      && mv "$DEST/game_bg.opt.wasm" "$DEST/game_bg.wasm" \
      || warn "wasm-opt failed; keeping the unoptimized build"
    AFTER=$(wc -c < "$DEST/game_bg.wasm")
    say "wasm: $((BEFORE / 1024)) KB -> $((AFTER / 1024)) KB"
  else
    warn "wasm-opt not found; skipping (install binaryen or 'npm i -g binaryen' for smaller builds)"
  fi
fi

if [[ $COPY_ASSETS -eq 1 && -d "$PROJ/assets" ]]; then
  say "Copying assets/"
  rm -rf "$DEST/assets"
  cp -R "$PROJ/assets" "$DEST/assets"
  # Zola would try to render Markdown files found in a page bundle
  find "$DEST/assets" -name '*.md' -delete
fi

COVER=""
for c in cover.png cover.jpg screenshot.png screenshot.jpg; do
  if [[ -f "$PROJ/$c" ]]; then cp "$PROJ/$c" "$DEST/cover.${c##*.}"; COVER="cover.${c##*.}"; break; fi
done
[[ -z "$COVER" && -f "$DEST/cover.png" ]] && COVER="cover.png"
[[ -z "$COVER" && -f "$DEST/cover.jpg" ]] && COVER="cover.jpg"

say "Packing source.zip"
python3 - "$PROJ" "$DEST/source.zip" "$SLUG" <<'PY'
import os, sys, zipfile
root, out, top = sys.argv[1], sys.argv[2], sys.argv[3]
skip_dirs = {"target", ".git", "node_modules", ".idea", ".vscode", "dist", "pkg"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in skip_dirs)
        for f in sorted(files):
            if f in (".DS_Store",):
                continue
            p = os.path.join(d, f)
            z.write(p, os.path.join(top, os.path.relpath(p, root)))
PY

# Main file shown first in the code browser
MAIN_FILE="src/main.rs"
[[ -n "$EXAMPLE" && -f "$PROJ/examples/$EXAMPLE.rs" ]] && MAIN_FILE="examples/$EXAMPLE.rs"
[[ -f "$PROJ/$MAIN_FILE" ]] || MAIN_FILE="$( (cd "$PROJ" && ls src/*.rs 2>/dev/null | head -n1) || echo Cargo.toml)"

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

INDEX="$DEST/index.md"
if [[ ! -f "$INDEX" ]]; then
  {
    echo "+++"
    echo "title = \"$(esc "$TITLE")\""
    [[ -n "$DESCRIPTION" ]] && echo "description = \"$(esc "$DESCRIPTION")\""
    echo "date = $(date +%Y-%m-%d)"
    echo ""
    echo "[taxonomies]"
    echo "tags = [\"bevy\", \"$RENDERER\"]"
    echo ""
    echo "[extra]"
    echo "wasm = \"game\""
    echo "renderer = \"$RENDERER\""
    echo "source_zip = \"source.zip\""
    echo "main_file = \"$MAIN_FILE\""
    [[ -n "$COVER" ]] && echo "image = \"$COVER\""
    [[ -n "$REPO" ]] && echo "repo = \"$(esc "$REPO")\""
    [[ -n "$BEVY_VERSION" ]] && echo "bevy_version = \"$BEVY_VERSION\""
    [[ -n "$LICENSE" ]] && echo "license = \"$(esc "$LICENSE")\""
    echo "# controls = [[\"← → / A D\", \"Move\"], [\"Space\", \"Jump\"]]"
    echo "+++"
    echo ""
    echo "Describe your project here. This text appears between the player and the source browser."
  } > "$INDEX"
  say "Created $INDEX"
else
  say "Kept existing $INDEX (front matter not modified)"
fi

SIZE=$(du -sh "$DEST" | cut -f1)
say "Done: content/projects/$CATEGORY/$SLUG ($SIZE)"
echo "    Preview with: zola serve   →   /projects/$CATEGORY/$SLUG/"
if ! grep -q 'canvas' "$PROJ/src/"*.rs 2>/dev/null; then
  warn "Tip: set canvas: Some(\"#bevy\".into()) and fit_canvas_to_parent: true on the primary Window"
  warn "     (the page also adopts a canvas Bevy appends to <body>, so it will still work)."
fi
