# Shared terminal styling for bash steps in the pnpm buildstatic chain.
# shellcheck shell=bash
# Usage: source "$(dirname "$0")/lib/build-cli.sh"  (from scripts/*.sh)

BUILD_CLI_WIDTH=62

build_hr() {
  local i s=""
  for ((i = 0; i < BUILD_CLI_WIDTH; i++)); do
    s+="─"
  done
  printf '\033[2m%s\033[0m\n' "$s"
}

# build_section "<emoji>" "Title"
build_section() {
  local emoji="$1"
  local title="$2"
  echo ""
  build_hr
  printf '%s  \033[1m%s\033[0m\n' "$emoji" "$title"
  build_hr
}

# build_section_done <exit_ok 0|1> "summary line 1" "summary line 2" ...
build_section_done() {
  local ok="$1"
  shift
  local line
  if [[ "$ok" -eq 0 ]]; then
    for line in "$@"; do
      printf '  \033[32m✓\033[0m  \033[32m%s\033[0m\n' "$line"
    done
  else
    for line in "$@"; do
      printf '  \033[31m✗\033[0m  \033[31m%s\033[0m\n' "$line"
    done
  fi
  build_hr
  echo ""
}

build_detail() {
  printf '     \033[2m%s\033[0m\n' "$1"
}

# build_parallel <function> [<function> ...]
# Runs each function at once, then prints each one's output in the order given,
# as if they had run one after another. Fails if any of them failed. For steps
# that neither read nor write each other's files.
build_parallel() {
  local dir i failed=0
  local -a pids=()
  dir="$(mktemp -d)"
  for i in "$@"; do
    "$i" >"$dir/$i.log" 2>&1 &
    pids+=("$!")
  done
  local n=0
  for i in "$@"; do
    if ! wait "${pids[$n]}"; then
      failed=1
    fi
    cat "$dir/$i.log" || true
    n=$((n + 1))
  done
  rm -rf "$dir"
  return "$failed"
}
