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
# on hosts that permit migrating a PID into one. If neither works the check
# reports RED even when the API is answering - it is answering now and will be
# dead in a second, and saying "healthy" to that is the original bug.
# See the comments on that function, and scripts/launch-listmonk.sh for the same
# problem on the newsletter host.
#
# Logs: LOG_DIR (or <repo>/logs); trim lines from LOG_LINES_KEEP (or 500).
#
# Optional env (see .env.template):
#   API_APP_NAME               — PM2 process name (default: ac-api)
#   API_HEALTHCHECK_PING_URL   — Healthchecks.io ping URL
#   API_HEALTH_PM2_HOME        — PM2 state dir (default: <repo>/.pm2)
#   API_HEALTH_PM2_ISOLATE     — 0 to skip the cgroup isolation described above
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

# Scratch file for pm2 output. NOT a command substitution: pm2 auto-spawns its
# God daemon, the daemon inherits our stdout, and $( ) blocks until every writer
# closes the pipe - i.e. until the daemon exits. Wrapping a pm2 call that might
# spawn it in $( ) can therefore hang the monitor outright. Every pm2 invocation
# below also gets </dev/null so the daemon cannot hold our stdin either.
PM2_OUT_TMP="$(mktemp "${TMPDIR:-/tmp}/ac-api-health.XXXXXX")"
trap 'rm -f "$PM2_OUT_TMP"' EXIT

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

# Bring a PM2 daemon up, as an argv systemd-run can exec. pm2 only reaches us
# through the nvm_pnpm shell function, and shell functions do not survive an
# exec, so the child re-sources the helper rather than us resolving a pm2 binary
# and its PATH by hand (`command -v pm2` under pnpm answers a *relative* path,
# which systemd-run rejects outright). Approach borrowed from the parallel work
# on dev/api-healthcheck-systemd-fix.
PM2_PING_ARGV=(
  /bin/bash -c 'set -euo pipefail
cd "$NVM_PNPM_PROJECT_DIR"
source "$NVM_PNPM_PROJECT_DIR/scripts/lib/nvm-pnpm.sh"
nvm_pnpm_init
nvm_pnpm exec pm2 ping'
)

# A scope inherits our exported environment; a transient unit inherits nothing,
# so everything nvm_pnpm_init and pm2 need has to be handed over explicitly.
pm2_unit_setenv_args() {
  printf '%s\n' \
    "--setenv=HOME=$HOME" \
    "--setenv=PATH=$PATH" \
    "--setenv=PM2_HOME=$PM2_HOME" \
    "--setenv=NVM_PNPM_PROJECT_DIR=$NVM_PNPM_PROJECT_DIR" \
    "--setenv=NVM_PNPM_USE_NVM=$NVM_PNPM_USE_NVM" \
    "--setenv=NVM_PNPM_NVM_DIR=$NVM_PNPM_NVM_DIR" \
    "--setenv=NVM_PNPM_NODE_VERSION=$NVM_PNPM_NODE_VERSION" \
    "--setenv=NVM_PNPM_PATH_EXTRA=$NVM_PNPM_PATH_EXTRA"
}

# Place the PM2 God daemon in a cgroup that outlives this (Type=oneshot) job.
# Ordering matters: the PM2 CLI auto-spawns the daemon on ANY command, `pm2
# status` included, so this must run before every other pm2 invocation.
#
# Sets PM2_DAEMON_PLACED to one of:
#   ok  - the daemon is in a cgroup that is not ours, so it survives our exit
#   na  - isolation not applicable (disabled by config, or no systemd user
#         session - dev machines and non-systemd hosts run this way by design)
#   bad - we could not place it; it will be reaped when this script exits
PM2_DAEMON_PLACED="na"
ensure_pm2_daemon() {
  if [[ "${API_HEALTH_PM2_ISOLATE:-1}" == "0" ]]; then
    PM2_DAEMON_PLACED="na"
    return 0
  fi
  if ! command -v systemd-run >/dev/null 2>&1; then
    log_echo "systemd-run unavailable; PM2 daemon will start in the caller's cgroup"
    PM2_DAEMON_PLACED="na"
    return 0
  fi

  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if [[ ! -d "$XDG_RUNTIME_DIR" ]]; then
    log_echo "no systemd user session at $XDG_RUNTIME_DIR; PM2 daemon will start in the caller's cgroup"
    PM2_DAEMON_PLACED="na"
    return 0
  fi

  # Already running: it either survived, or a prior run placed it. Still has to
  # be judged on where it actually is - a daemon adopted into an earlier job's
  # cgroup is exactly the state we must not report green on.
  if pm2_daemon_pid >/dev/null; then
    if pm2_daemon_placed_ok; then
      PM2_DAEMON_PLACED="ok"
      return 0
    fi
    log_echo "WARN: existing PM2 daemon shares this job's cgroup; restarting it somewhere safe"
    nvm_pnpm exec pm2 kill >/dev/null 2>&1 </dev/null || true
  fi

  local -a setenv_args=()
  while IFS= read -r arg; do setenv_args+=("$arg"); done < <(pm2_unit_setenv_args)

  # Attempt 1: a transient UNIT. This is the one that works on May First:
  # `--unit=` has systemd fork the process directly into the new cgroup, so no
  # PID has to be migrated. Verified on weborigin002 (2026-09-07).
  #
  # `pm2 ping` exits as soon as the daemon is up, so the unit needs
  # KillMode=process plus RemainAfterExit: without them the unit going inactive
  # takes the daemon we just spawned down with it, which is the very thing this
  # function exists to prevent.
  systemctl --user reset-failed ac-api-pm2-daemon.service >/dev/null 2>&1 || true
  systemd-run --user --unit=ac-api-pm2-daemon --quiet \
    --property=KillMode=process \
    --property=RemainAfterExit=yes \
    "${setenv_args[@]}" \
    -- "${PM2_PING_ARGV[@]}" >/dev/null 2>&1 || true
  if pm2_daemon_placed_ok; then
    log_echo "PM2 daemon started in its own systemd unit"
    PM2_DAEMON_PLACED="ok"
    return 0
  fi

  # Clear out a daemon that got spawned but landed in our cgroup anyway, or the
  # next attempt just pings that misplaced daemon and declares success.
  nvm_pnpm exec pm2 kill >/dev/null 2>&1 </dev/null || true

  # Attempt 2: a scope. Tried second, not first, because on these hosts cgroup
  # delegation to the user manager is restricted and a scope cannot migrate an
  # already-running PID (systemd-run's own) into the new cgroup:
  #   Couldn't move process ... Input/output error
  #   Failed to add PIDs to scope's control group: Permission denied
  # Worse, it fails QUIETLY - `pm2 ping` has already run and left the daemon in
  # the caller's cgroup - which is why every attempt here is judged by
  # pm2_daemon_placed_ok() and never by systemd-run's exit status. Kept for
  # hosts that do allow it, where a scope is the better mechanism: it inherits
  # our whole environment, and --collect reaps it once it empties.
  systemd-run --user --scope --quiet --collect \
    --unit="ac-api-pm2-daemon-$$" -- "${PM2_PING_ARGV[@]}" >/dev/null 2>&1 || true
  if pm2_daemon_placed_ok; then
    log_echo "PM2 daemon started in its own systemd scope"
    PM2_DAEMON_PLACED="ok"
    return 0
  fi

  log_echo "ERROR: could not place the PM2 daemon outside this job's cgroup; it will be reaped when this script exits"
  PM2_DAEMON_PLACED="bad"
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
  nvm_pnpm exec pm2 status "$APP_NAME" --no-color >"$PM2_OUT_TMP" 2>&1 </dev/null || true
  cat "$PM2_OUT_TMP" >> "$LOG_FILE"
  PM2_OUTPUT="$(cat "$PM2_OUT_TMP")"
  grep -q "online" "$PM2_OUT_TMP"
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
  nvm_pnpm api:start >"$PM2_OUT_TMP" 2>&1 </dev/null || true
  cat "$PM2_OUT_TMP" >> "$LOG_FILE"

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

# A green probe is NOT enough when the daemon could not be placed: the API is
# answering right now but is about to be reaped on our way out, which is exactly
# the state that reported healthy every five minutes while the site served 503s.
# Report the truth instead of the snapshot.
if [[ "$service_online" == true && "$PM2_DAEMON_PLACED" == "bad" ]]; then
  log_echo "WARN: API is answering, but its PM2 daemon shares this job's cgroup and will be killed on exit"
  service_online=false
fi

status_line="pm2_online=$pm2_online probe=$PROBE_VERDICT daemon_placed=$PM2_DAEMON_PLACED restart_attempted=$needs_restart"

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
