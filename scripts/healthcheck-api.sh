#!/usr/bin/env bash
#
# Health check + auto-restart for the ac-api Fastify server (PM2 app "ac-api").
#
# Runs on the main site host. Two independent probes:
#
#   1. PM2 state - is APP_NAME listed as "online"?
#   2. HTTP probe - does the API actually serve its expected payload?
#
# The second one is the one that catches real outages. "online" in `pm2 status`
# only means PM2 has a child it has not seen exit: it says nothing about whether
# Fastify bound the port, whether the routes registered, or whether a wedged
# event loop is refusing every request. This monitor used to ping Healthchecks
# green on that text alone. See scripts/lib/api-probe.sh for why the probe has to
# assert on the response body and not just the status code (api/subscribe.js
# returns its result object, so Fastify answers HTTP 200 even on failure).
#
# Scheduling: run it every 5 minutes. May First no longer honours user crontabs on
# these hosts, so the job is defined in the control panel, which generates
# ~/.config/systemd/user/red-item-<id>.{service,timer}. Verify it is actually
# scheduled, because a missing job looks exactly like a healthy service that
# never alerts:
#   systemctl --user list-timers
#   journalctl --user -u red-item-<id>.service
#
# IMPORTANT (systemd): those generated units are Type=oneshot, which defaults to
# KillMode=control-group - when this script exits, systemd SIGTERMs everything
# left in the unit's cgroup. The PM2 CLI auto-spawns the God daemon on ANY
# command, `pm2 status` included, so a plain first call adopts the daemon (and
# ac-api with it) into the doomed cgroup: the check restarts the API, reports
# green, and then kills it on the way out. ensure_pm2_daemon() below places the
# daemon in its own cgroup first: a transient unit, which works here because
# systemd forks straight into the new cgroup, falling back to a transient scope
# on hosts that permit migrating a PID into one.
# See the comments on that function, and scripts/launch-listmonk.sh for the same
# problem on the newsletter host.
#
# Logs: LOG_DIR (or <repo>/logs); trim lines from LOG_LINES_KEEP (or 500).
#
# Optional env (see .env.template):
#   API_APP_NAME               — PM2 process name (default: ac-api)
#   API_HEALTHCHECK_PING_URL   — Healthchecks.io ping URL
#   API_HEALTH_PM2_HOME        — PM2 state dir (default: <repo>/.pm2)
#   API_HEALTH_PM2_SCOPE       — 0 to skip the cgroup isolation described above
#   API_HEALTH_PROBE_URL       — HTTP probe target; empty disables the probe
#   API_HEALTH_PROBE_MARKER    — string the probe body must contain
#   API_HEALTH_PROBE_TIMEOUT   — seconds for the probe request (default 10)
#   API_HEALTH_START_ATTEMPTS  — post-restart probes (default 6)
#   API_HEALTH_START_RETRY_SLEEP — seconds between probes (default 5)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Optional: keep compatibility with environments that rely on ~/.bashrc for nvm/pnpm.
if [[ "${API_HEALTH_SOURCE_BASHRC:-0}" == "1" ]] && [[ -f "${HOME}/.bashrc" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/.bashrc"
fi

# Load repo env values.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/load-env.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/log.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/api-probe.sh"

PROJECT_DIR="${PROJECT_DIR:-$ROOT_DIR}"
APP_NAME="${API_APP_NAME:-ac-api}"
API_HEALTHCHECK_PING_URL="${API_HEALTHCHECK_PING_URL:-}"
PM2_HOME="${API_HEALTH_PM2_HOME:-$PROJECT_DIR/.pm2}"
export PM2_HOME

# Probe the loopback port directly rather than the public URL: this monitor owns
# ac-api, not nginx, and restarting the app cannot fix a proxy or TLS problem.
# scripts/healthcheck-site.sh already covers the public path.
PROBE_URL="${API_HEALTH_PROBE_URL-http://127.0.0.1:${API_PORT:-4321}/api-server/hello}"
# The distinctive half of /api-server/hello's {"message":"Hello World"} response.
# Matching the value, not the whole JSON, survives serializer whitespace changes.
PROBE_MARKER="${API_HEALTH_PROBE_MARKER:-Hello World}"
PROBE_TIMEOUT="${API_HEALTH_PROBE_TIMEOUT:-10}"
START_ATTEMPTS="${API_HEALTH_START_ATTEMPTS:-6}"
START_RETRY_SLEEP="${API_HEALTH_START_RETRY_SLEEP:-5}"

# Shared nvm-pnpm lib (scripts/lib/nvm-pnpm.sh): prefer NVM_PNPM_* from .env;
# API_HEALTH_* nvm vars are legacy aliases only.
export NVM_PNPM_PROJECT_DIR="$PROJECT_DIR"
export NVM_PNPM_USE_NVM="${NVM_PNPM_USE_NVM:-${API_HEALTH_USE_NVM:-0}}"
export NVM_PNPM_NVM_DIR="${NVM_PNPM_NVM_DIR:-${API_HEALTH_NVM_DIR:-$HOME/.nvm}}"
export NVM_PNPM_NODE_VERSION="${NVM_PNPM_NODE_VERSION:-${API_HEALTH_NODE_VERSION:-}}"
export NVM_PNPM_PATH_EXTRA="${NVM_PNPM_PATH_EXTRA:-${API_HEALTH_PATH_EXTRA:-}}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/nvm-pnpm.sh"
nvm_pnpm_err() {
  log_echo "$1"
}

init_scripts_file_log "$(resolve_server_log_dir "$PROJECT_DIR")" "api-health-monitor.log" "$(resolve_server_log_lines_keep)"
mkdir -p "$PM2_HOME" "$PM2_HOME/logs" "$PM2_HOME/pids" "$PM2_HOME/modules"

hc_post() {
  local url="$1"
  local body="$2"
  # Never let a failed ping crash the monitor script.
  curl -fsS --max-time 10 --retry 3 --data-raw "$body" "$url" >/dev/null || true
}

hc_fail() {
  local body="$1"
  if [[ -n "$API_HEALTHCHECK_PING_URL" ]]; then
    hc_post "${API_HEALTHCHECK_PING_URL%/}/fail" "$body"
  fi
}

hc_ok() {
  local body="$1"
  if [[ -n "$API_HEALTHCHECK_PING_URL" ]]; then
    hc_post "${API_HEALTHCHECK_PING_URL%/}" "$body"
  fi
}

# --- PM2 daemon placement (see the systemd note in the header) ---

pm2_daemon_pid() {
  local pidfile="${PM2_HOME:-$HOME/.pm2}/pm2.pid" pid
  [[ -r "$pidfile" ]] || return 1
  pid="$(cat "$pidfile" 2>/dev/null)" || return 1
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

# cgroup path of a pid (systemd unified hierarchy), empty when unavailable.
proc_cgroup() {
  local pid="$1"
  [[ -r "/proc/$pid/cgroup" ]] || return 0
  awk -F: '$1 == "0" { print $3; exit }' "/proc/$pid/cgroup" 2>/dev/null || true
}

# 0 when a PM2 daemon is running in a cgroup that is NOT this job's - i.e. it
# will survive our exit. When cgroup info is unavailable (no /proc, e.g. macOS)
# fall back to "is it running at all" rather than reporting a false failure.
pm2_daemon_placed_ok() {
  local pid ours theirs
  pid="$(pm2_daemon_pid)" || return 1
  ours="$(proc_cgroup "$$")"
  theirs="$(proc_cgroup "$pid")"
  if [[ -z "$ours" || -z "$theirs" ]]; then
    return 0
  fi
  [[ "$ours" != "$theirs" ]]
}

# Resolve a directly executable pm2 plus the PATH that finds its node. systemd-run
# needs a real binary, and nvm_pnpm is a shell function that may wrap
# `nvm exec <ver> pnpm`. Neither command here runs pm2, so this does not spawn the
# daemon before we have placed it.
pm2_exec_env() {
  # `command -v pm2` under pnpm answers "./node_modules/.bin/pm2" - a relative
  # path, which systemd-run rejects outright. Absolutise it here.
  nvm_pnpm exec bash -c '
    p="$(command -v pm2)" || exit 1
    [[ "$p" == /* ]] || p="$PWD/${p#./}"
    printf "%s\n%s\n" "$p" "$PATH"
  ' 2>/dev/null || true
}

# Start the PM2 God daemon inside its own transient systemd scope, so it lives in
# a different cgroup than this (Type=oneshot) job and is not reaped when we exit.
# Ordering matters: the PM2 CLI auto-spawns the daemon on ANY command, `pm2 status`
# included, so this must run before every other pm2 invocation.
ensure_pm2_daemon() {
  if [[ "${API_HEALTH_PM2_SCOPE:-1}" == "0" ]]; then
    return 0
  fi
  # Already running: it either survived, or a prior run placed it correctly.
  if pm2_daemon_pid >/dev/null; then
    return 0
  fi
  if ! command -v systemd-run >/dev/null 2>&1; then
    return 0
  fi

  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if [[ ! -d "$XDG_RUNTIME_DIR" ]]; then
    return 0
  fi

  local resolved pm2_bin scope_path
  resolved="$(pm2_exec_env)"
  pm2_bin="$(printf '%s\n' "$resolved" | sed -n '1p')"
  scope_path="$(printf '%s\n' "$resolved" | sed -n '2p')"
  # systemd-run needs an absolute, executable path; anything else is a silent no-op.
  if [[ "$pm2_bin" != /* || ! -x "$pm2_bin" ]]; then
    log_echo "WARN: could not resolve a pm2 binary for systemd-run; PM2 may be reaped when this job exits"
    return 0
  fi

  # Attempt 1: a transient UNIT. This is the one that works on May First:
  # `--unit=` has systemd fork the process directly into the new cgroup, so no
  # PID has to be migrated. Verified on weborigin002 (2026-09-07).
  #
  # Two costs, both handled here. The environment does NOT come along the way it
  # would with a scope, hence --setenv for the PATH that finds node plus
  # PM2_HOME and HOME (pm2 derives its default state dir from HOME). And
  # `pm2 ping` exits as soon as the daemon is up, so the unit needs
  # KillMode=process plus RemainAfterExit: without them the unit going inactive
  # takes the daemon we just spawned down with it, which is the very thing this
  # function exists to prevent.
  systemctl --user reset-failed ac-api-pm2-daemon.service >/dev/null 2>&1 || true
  systemd-run --user --unit=ac-api-pm2-daemon --quiet \
    --property=KillMode=process \
    --property=RemainAfterExit=yes \
    --setenv=PATH="${scope_path:-$PATH}" \
    --setenv=PM2_HOME="$PM2_HOME" \
    --setenv=HOME="$HOME" \
    -- "$pm2_bin" ping >/dev/null 2>&1 || true
  if pm2_daemon_placed_ok; then
    log_echo "PM2 daemon started in its own systemd unit"
    return 0
  fi

  # Clear out a daemon that got spawned but landed in our cgroup anyway, or the
  # next attempt just pings that misplaced daemon and declares success. Safe to
  # kill here: we only reach this point when no daemon was running on entry, so
  # nothing is parented to it yet.
  nvm_pnpm exec pm2 kill >/dev/null 2>&1 || true

  # Attempt 2: a scope. Tried second, not first, because on these hosts cgroup
  # delegation to the user manager is restricted and a scope cannot migrate an
  # already-running PID (systemd-run's own) into the new cgroup:
  #   test-scope-probe.scope: Couldn't move process ... Input/output error
  #   test-scope-probe.scope: Failed to add PIDs to scope's control group: Permission denied
  # Worse, it fails QUIETLY - `pm2 ping` has already run and left the daemon in
  # the caller's cgroup - which is why every attempt here is judged by
  # pm2_daemon_placed_ok() and never by systemd-run's exit status. Kept as a
  # fallback for hosts that do allow it, where a scope is the better mechanism:
  # the command is forked from here, so it inherits our whole environment and
  # needs no --setenv at all, and --collect reaps the scope once it empties.
  PATH="${scope_path:-$PATH}" systemd-run --user --scope --quiet --collect \
    --unit="ac-api-pm2-daemon-$$" -- "$pm2_bin" ping >/dev/null 2>&1 || true
  if pm2_daemon_placed_ok; then
    log_echo "PM2 daemon started in its own systemd scope"
    return 0
  fi

  log_echo "WARN: could not place the PM2 daemon outside this job's cgroup; it may be reaped when this job exits"
}

# Warn when the daemon shares our cgroup, which means systemd will kill it the
# moment this script returns. Purely diagnostic, but this is the exact condition
# that let a green health check sit on top of a dead service.
warn_if_pm2_shares_our_cgroup() {
  local pid ours theirs
  pid="$(pm2_daemon_pid)" || return 0
  ours="$(proc_cgroup "$$")"
  theirs="$(proc_cgroup "$pid")"
  [[ -n "$ours" && -n "$theirs" ]] || return 0
  if [[ "$ours" == "$theirs" ]]; then
    log_echo "WARN: PM2 daemon (pid $pid) is in this job's cgroup ($ours)."
    log_echo "      A Type=oneshot unit will SIGTERM it when this script exits."
  fi
}

# --- HTTP probe ---

# Sets PROBE_VERDICT. See scripts/lib/api-probe.sh for what each verdict means.
PROBE_VERDICT="SKIPPED"
run_probe() {
  local label="$1" result code detail
  if [[ -z "$PROBE_URL" ]]; then
    PROBE_VERDICT="SKIPPED"
    log_echo "SKIP: HTTP probe disabled (set API_HEALTH_PROBE_URL to enable)"
    return 0
  fi

  result="$(api_probe "$PROBE_URL" "$PROBE_MARKER" "$PROBE_TIMEOUT")"
  PROBE_VERDICT="${result%% *}"
  result="${result#* }"
  code="${result%% *}"
  detail="${result#* }"

  case "$PROBE_VERDICT" in
    PASS)
      log_echo "OK: $label probe served the expected payload from $PROBE_URL (http=$code)"
      ;;
    FAIL)
      # The 200 here is the trap: something answers, but it is not a working API.
      log_echo "ERROR: $label probe - $PROBE_URL answered http=$code but the body did not contain '$PROBE_MARKER': $detail"
      ;;
    DOWN)
      log_echo "ERROR: $label probe - nothing healthy answered at $PROBE_URL (http=$code): $detail"
      ;;
    INCONCLUSIVE)
      log_echo "WARN: $label probe rate limited (http=$code); treating as inconclusive: $detail"
      ;;
    BAD_REQUEST)
      log_echo "ERROR: $label probe rejected (http=$code) - check API_HEALTH_PROBE_URL and API_HEALTH_PROBE_MARKER: $detail"
      ;;
  esac
}

pm2_is_online() {
  local output
  output="$(nvm_pnpm exec pm2 status "$APP_NAME" --no-color 2>&1 || true)"
  printf '%s\n' "$output" >> "$LOG_FILE"
  PM2_OUTPUT="$output"
  grep -q "online" <<<"$output"
}

# --- main ---

log_echo "=== API Health Monitor Started ==="
log_echo "Project: $PROJECT_DIR"
log_echo "App: $APP_NAME"
log_echo "Log file: $LOG_FILE"
log_echo "PM2_HOME: $PM2_HOME"
log_echo "Probe: ${PROBE_URL:-<disabled>}"

if [[ ! -d "$PROJECT_DIR" ]]; then
  msg="api-health failed ($(date -u +"%Y-%m-%dT%H:%M:%SZ"))\nproject_dir_missing=$PROJECT_DIR\npm2_home=$PM2_HOME"
  log_echo "ERROR: Project directory missing: $PROJECT_DIR"
  hc_fail "$msg"
  exit 1
fi

cd "$PROJECT_DIR"

if ! nvm_pnpm_init; then
  msg=$(
    printf "api-health failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "reason=pnpm_not_found\n"
    printf "project_dir=%s\npm2_home=%s\npath=%s\n" "$PROJECT_DIR" "$PM2_HOME" "$PATH"
  )
  log_echo "ERROR: pnpm not found. PATH=$PATH"
  hc_fail "$msg"
  exit 1
fi

if [[ -n "${NVM_PNPM_RESOLVED_VERSION:-}" ]]; then
  log_echo "Node: $(nvm exec "$NVM_PNPM_RESOLVED_VERSION" node -v) (nvm exec $NVM_PNPM_RESOLVED_VERSION)"
  log_echo "pnpm: $(nvm exec "$NVM_PNPM_RESOLVED_VERSION" command -v pnpm)"
else
  log_echo "pnpm: $(command -v pnpm)"
fi

# MUST come before any other pm2 command - see the systemd note in the header.
ensure_pm2_daemon

PM2_OUTPUT=""
pm2_online=false
if pm2_is_online; then
  log_echo "OK: $APP_NAME is online in PM2"
  pm2_online=true
else
  log_echo "WARN: $APP_NAME is not online in PM2"
fi

run_probe "initial"

# Restart only for problems a restart can actually fix. A rate-limited probe
# proves nothing, and a misconfigured probe URL is not the API's fault - bouncing
# the service on those just adds an outage to an outage.
needs_restart=false
if [[ "$pm2_online" == false ]]; then
  needs_restart=true
elif [[ "$PROBE_VERDICT" == "FAIL" || "$PROBE_VERDICT" == "DOWN" ]]; then
  log_echo "PM2 reports $APP_NAME online but it is not serving; restarting anyway."
  needs_restart=true
fi

if [[ "$needs_restart" == true ]]; then
  log_echo "Attempting to start/restart $APP_NAME..."
  START_OUTPUT="$(nvm_pnpm api:start 2>&1 || true)"
  printf '%s\n' "$START_OUTPUT" >> "$LOG_FILE"

  pm2_online=false
  for ((attempt = 1; attempt <= START_ATTEMPTS; attempt++)); do
    sleep "$START_RETRY_SLEEP"
    if pm2_is_online; then
      pm2_online=true
      run_probe "post-restart"
      # A freshly started Fastify can be listed online a beat before it binds the
      # port, so keep probing rather than failing on the first refused connection.
      if [[ "$PROBE_VERDICT" != "FAIL" && "$PROBE_VERDICT" != "DOWN" ]]; then
        log_echo "OK: $APP_NAME recovered after $((attempt * START_RETRY_SLEEP))s"
        break
      fi
    fi
    log_echo "  ... attempt $attempt/$START_ATTEMPTS: not healthy yet"
  done

  if [[ "$pm2_online" == false ]]; then
    log_echo "ERROR: $APP_NAME failed to become online"
  fi
fi

# Green requires PM2 online AND a probe that did not fail. INCONCLUSIVE and
# SKIPPED stay green: they carry no evidence of an outage, and flapping the alert
# on a rate limit trains people to ignore it. BAD_REQUEST is red on purpose - a
# monitor that cannot verify anything must not claim the service is healthy.
service_online=false
if [[ "$pm2_online" == true ]]; then
  case "$PROBE_VERDICT" in
    PASS | INCONCLUSIVE | SKIPPED) service_online=true ;;
  esac
fi

status_line="pm2_online=$pm2_online probe=$PROBE_VERDICT restart_attempted=$needs_restart"

# Diagnose the cgroup trap before we exit, whichever way this went.
warn_if_pm2_shares_our_cgroup

if [[ "$service_online" == true ]]; then
  hc_ok "api-health ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") app=$APP_NAME $status_line"
  log_echo "OK: API health ping sent ($status_line)"
else
  body=$(
    printf "api-health failed (%s)\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf "app=%s\nproject_dir=%s\npm2_home=%s\n" "$APP_NAME" "$PROJECT_DIR" "$PM2_HOME"
    printf "%s\nprobe_url=%s\n" "$status_line" "${PROBE_URL:-<disabled>}"
    printf "pm2_status_snippet=%s\n" "$(printf '%s' "$PM2_OUTPUT" | tr '\n' ' ' | head -c 400)"
  )
  hc_fail "$body"
  log_echo "WARN: Service not healthy; sent fail ping ($status_line)"
  log_echo "=== API Health Monitor Completed ==="
  trim_log
  exit 1
fi

log_echo "=== API Health Monitor Completed ==="
trim_log
