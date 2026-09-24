#!/usr/bin/env bash
# Incremental rsync РІвЂ вЂ™ NAS with daily versions and retry while the share is down.
#   sudo nas-backup-run.sh
#   sudo nas-backup-run.sh --dry-run
#   sudo nas-backup-run.sh --only=videal-edo
#   nas-backup-run.sh status
set -euo pipefail
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

CONF="${NAS_BACKUP_CONF:-/etc/nas-backup.conf}"
LOG_TAG="nas-backup"
STATE_DIR=/var/lib/nas-backup
LOG_DIR=/var/log/nas-backup
STATUS_FILE="${STATE_DIR}/status.json"
RESUME_FLAG="${STATE_DIR}/resume"
LOCK_FILE="${STATE_DIR}/lock"
DRY_RUN=0
ONLY_NAME=""

log() {
  echo "[$(date '+%F %T')] $*"
  logger -t "${LOG_TAG}" "$*" 2>/dev/null || true
}

die() { log "ERROR: $*"; write_status failed "$*"; rm -f "${RESUME_FLAG}"; exit 1; }

usage() {
  echo "Usage: $0 [--dry-run] [--only=NAME] [status]"
  exit 2
}

write_status() {
  local state="$1"
  local msg="${2:-}"
  NB_STATE="$state" NB_MSG="$msg" NB_PID="$$" python3 - "$STATUS_FILE" <<'PY'
import json, os, sys
from datetime import datetime, timezone
path = sys.argv[1]
now = datetime.now().astimezone().isoformat(timespec="seconds")
data = {}
if os.path.isfile(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {}
state = os.environ.get("NB_STATE", "")
msg = os.environ.get("NB_MSG", "")
data["state"] = state
data["message"] = msg
data["pid"] = int(os.environ.get("NB_PID") or 0)
data["updated"] = now
if state in ("running", "waiting_nas"):
    data["started"] = data.get("started") or now
if state in ("success", "partial", "failed"):
    data["finished"] = now
    if state != "failed":
        data["last_ok"] = now
os.makedirs(os.path.dirname(path), exist_ok=True)
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
}

print_status() {
  if [[ -f "${STATUS_FILE}" ]]; then
    python3 - "$STATUS_FILE" "$RESUME_FLAG" <<'PY'
import json, os, sys
path, resume = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    d = json.load(f)
print("state:    ", d.get("state"))
print("message:  ", d.get("message"))
print("started:  ", d.get("started"))
print("updated:  ", d.get("updated"))
print("finished: ", d.get("finished"))
print("last_ok:  ", d.get("last_ok"))
print("resume:   ", "yes" if os.path.exists(resume) else "no")
PY
  else
    echo "state:     never-run"
  fi
  systemctl is-active nas-backup.service --quiet && echo "service:   active" || echo "service:   inactive"
  systemctl is-enabled nas-backup.timer --quiet && echo "timer:     enabled" || echo "timer:     disabled"
  systemctl list-timers nas-backup.timer --no-pager 2>/dev/null | tail -n +1 | head -n 3
}

for arg in "$@"; do
  case "$arg" in
    status|--status) print_status; exit 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --only=*) ONLY_NAME="${arg#--only=}" ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || die "run as root"
[[ -f "${CONF}" ]] || die "missing ${CONF}"
# shellcheck source=/dev/null
source "${CONF}"

: "${NAS_HOST:?}" "${NAS_SHARE:?}" "${MOUNT_POINT:?}" "${CRED_FILE:?}"
NAS_SUBDIR="${NAS_SUBDIR:-Backups/Videal-Ubuntu}"
KEEP_DAYS="${KEEP_DAYS:-30}"
RETRY_MINUTES="${RETRY_MINUTES:-10}"
RETRY_UNTIL="${RETRY_UNTIL:-20:00}"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"
MAIL_HELPER="${MAIL_HELPER:-/srv/videal-edo/deploy/nas-backup-mail.mjs}"
MAIL_DONE=0

notify_mail() {
  local kind="$1"
  local detail="${2:-}"
  local subject bodyf
  if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
    return 0
  fi
  if [[ -z "${NOTIFY_EMAIL}" ]]; then
    log "mail skip: NOTIFY_EMAIL empty"
    return 0
  fi
  if [[ ! -f "${MAIL_HELPER}" ]]; then
    log "mail skip: missing ${MAIL_HELPER}"
    return 0
  fi
  sleep 1
  bodyf="$(mktemp /tmp/nas-backup-mail.XXXXXX)"
  {
    echo "Хост: $(hostname)"
    echo "Дата: ${DATESTAMP:-$(date +%Y-%m-%d)} $(date '+%H:%M:%S %z')"
    echo "Исход: ${kind}"
    if [[ -n "${detail}" ]]; then
      echo "Сообщение: ${detail}"
    fi
    echo "Наборы: share (/srv/samba/share) и videal-edo (/srv/videal-edo)"
    if [[ "${kind}" == "success" ]]; then
      echo "Файл .last-backup-ok обновлён."
    fi
    if [[ -f "${STATUS_FILE}" ]]; then
      echo
      echo "=== status.json ==="
      cat "${STATUS_FILE}"
    fi
    if [[ -n "${LATEST_LOG:-}" && -f "${LATEST_LOG}" ]]; then
      echo
      echo "=== хвост latest.log ==="
      tail -n 80 "${LATEST_LOG}"
    fi
  } > "${bodyf}"
  case "${kind}" in
    started) subject="[Videal NAS] копия ${DATESTAMP:-$(date +%Y-%m-%d)} — начато" ;;
    success) subject="[Videal NAS] копия ${DATESTAMP:-$(date +%Y-%m-%d)} — успешно" ;;
    partial) subject="[Videal NAS] копия ${DATESTAMP:-$(date +%Y-%m-%d)} — не полностью" ;;
    *) subject="[Videal NAS] копия ${DATESTAMP:-$(date +%Y-%m-%d)} — ошибка" ;;
  esac
  if node "${MAIL_HELPER}" --to "${NOTIFY_EMAIL}" --subject "${subject}" --body-file "${bodyf}"; then
    log "mail sent to ${NOTIFY_EMAIL} (${kind})"
  else
    log "mail FAILED to ${NOTIFY_EMAIL} (${kind})"
  fi
  rm -f "${bodyf}"
  if [[ "${kind}" != "started" ]]; then
    MAIL_DONE=1
  fi
}

die() {
  log "ERROR: $*"
  write_status failed "$*"
  rm -f "${RESUME_FLAG}"
  notify_mail failed "$*"
  exit 1
}

[[ -f "${CRED_FILE}" ]] || die "credentials missing: ${CRED_FILE}"

mkdir -p "${STATE_DIR}" "${LOG_DIR}" "${MOUNT_POINT}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "already running"
  exit 0
fi

DATESTAMP="$(date +%Y-%m-%d)"
LOG_FILE="${LOG_DIR}/backup-${DATESTAMP}-$(date +%H%M%S).log"
LATEST_LOG="${LOG_DIR}/latest.log"
: > "${LATEST_LOG}"
exec > >(tee -a "${LOG_FILE}" "${LATEST_LOG}") 2>&1

touch "${RESUME_FLAG}"
write_status running "starting"

cleanup() {
  rm -f "${RESUME_FLAG}"
  if mountpoint -q "${MOUNT_POINT}" 2>/dev/null; then
    log "Unmount ${MOUNT_POINT}"
    umount "${MOUNT_POINT}" 2>/dev/null || umount -l "${MOUNT_POINT}" 2>/dev/null || true
  fi
}

on_exit() {
  local rc=$?
  cleanup
  if [[ "${MAIL_DONE:-0}" -eq 0 && "${DRY_RUN:-0}" -eq 0 ]]; then
    notify_mail failed "процесс завершился с кодом ${rc} без итогового письма"
  fi
}
trap on_exit EXIT

past_retry_until() {
  local now until
  now="$(date +%H%M)"
  until="$(echo "${RETRY_UNTIL}" | tr -d ':')"
  [[ "${now}" > "${until}" ]]
}

force_unmount() {
  if mountpoint -q "${MOUNT_POINT}" 2>/dev/null || grep -q " ${MOUNT_POINT} " /proc/mounts; then
    umount "${MOUNT_POINT}" 2>/dev/null || umount -l "${MOUNT_POINT}" 2>/dev/null || true
  fi
}

nas_reachable() {
  ping -c 1 -W 3 "${NAS_HOST}" >/dev/null 2>&1 || return 1
  smbclient "//${NAS_HOST}/${NAS_SHARE}" -A "${CRED_FILE}" -c "ls" >/dev/null 2>&1
}

mount_and_probe() {
  force_unmount
  mkdir -p "${MOUNT_POINT}"
  mount -t cifs "//${NAS_HOST}/${NAS_SHARE}" "${MOUNT_POINT}" \
    -o "credentials=${CRED_FILE},uid=0,gid=0,file_mode=0644,dir_mode=0755,iocharset=utf8,vers=3.0,noperm,serverino" \
    || return 1
  local dest="${MOUNT_POINT}/${NAS_SUBDIR}"
  mkdir -p "${dest}/current" "${dest}/versions" || return 1
  local probe="${dest}/.write-test"
  if date -Is > "${probe}" 2>/dev/null; then
    rm -f "${probe}"
    return 0
  fi
  log "NAS mounted, write probe failed (share full or read-only)"
  return 0
}

wait_for_nas() {
  local n=0
  while true; do
    if nas_reachable && mount_and_probe; then
      log "NAS ready at ${NAS_HOST}"
      return 0
    fi
    force_unmount
    if past_retry_until && [[ "${n}" -gt 0 ]]; then
      return 1
    fi
    n=$((n + 1))
    write_status waiting_nas "NAS down, retry ${n}, next in ${RETRY_MINUTES}m"
    log "NAS not ready (try ${n}), sleep ${RETRY_MINUTES}m"
    sleep $((RETRY_MINUTES * 60))
  done
}

log "=== nas-backup start dry_run=${DRY_RUN} only=${ONLY_NAME:-all} ==="
if ! wait_for_nas; then
  die "NAS still down after ${RETRY_UNTIL}"
fi

DEST_ROOT="${MOUNT_POINT}/${NAS_SUBDIR}"
CURRENT="${DEST_ROOT}/current"
VERSIONS="${DEST_ROOT}/versions/${DATESTAMP}"
mkdir -p "${CURRENT}" "${VERSIONS}" || die "нет места или нет прав: ${CURRENT} ${VERSIONS}"
notify_mail started "NAS доступен, начато копирование (share + videal-edo). Итоговое письмо придёт, когда rsync закончит."

overall_rc=0
transferred=0

run_one() {
  local name="$1" src="$2"
  [[ -d "${src}" ]] || { log "skip missing source ${src}"; return 0; }
  if [[ "${name}" == "videal-edo" ]]; then
    local db="${src%/}/data/videal.db"
    local snap="${src%/}/data/videal.sqlite-snapshot"
    if [[ -f "${db}" ]]; then
      log "sqlite online backup ${db} -> ${snap}"
      sqlite3 "${db}" ".backup '${snap}'" || log "sqlite snapshot failed"
    fi
  fi
  local dest="${CURRENT}/${name}/"
  local bak="${VERSIONS}/${name}/"
  mkdir -p "${dest}" "${bak}"
  local cmd=(rsync)
  if declare -p RSYNC_OPTS 2>/dev/null | grep -q 'declare \-a'; then
    cmd+=("${RSYNC_OPTS[@]}")
  else
    # shellcheck disable=SC2206
    cmd+=(${RSYNC_OPTS})
  fi
  if declare -p RSYNC_EXCLUDES 2>/dev/null | grep -q 'declare \-a'; then
    cmd+=("${RSYNC_EXCLUDES[@]}")
  else
    # shellcheck disable=SC2206
    cmd+=(${RSYNC_EXCLUDES})
  fi
  if [[ "${name}" == "videal-edo" ]]; then
    cmd+=(--exclude 'data/videal.db-wal' --exclude 'data/videal.db-shm')
  fi
  cmd+=(--delete --backup --backup-dir="${bak}")
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    cmd+=(-n --itemize-changes)
  fi
  cmd+=(--stats)
  [[ "${src}" == */ ]] || src="${src}/"
  cmd+=("${src}" "${dest}")
  log "rsync ${src} -> ${dest}  versions ${bak}"
  set +e
  "${cmd[@]}"
  local rc=$?
  set -e
  case "${rc}" in
    0) log "OK ${name} rc=0" ;;
    23|24)
      log "PARTIAL ${name} rc=${rc} (some files skipped)"
      overall_rc=23
      ;;
    *)
      log "FAILED ${name} rc=${rc}"
      overall_rc="${rc}"
      ;;
  esac
}

if declare -p SOURCES 2>/dev/null | grep -q 'declare \-a'; then
  :
else
  SOURCES=("share|${SRC:-/srv/samba/share/}")
fi

for item in "${SOURCES[@]}"; do
  name="${item%%|*}"
  src="${item#*|}"
  if [[ -n "${ONLY_NAME}" && "${name}" != "${ONLY_NAME}" ]]; then
    continue
  fi
  run_one "${name}" "${src}"
done

if [[ "${DRY_RUN}" -eq 0 && "${overall_rc}" -eq 0 ]]; then
  find "${DEST_ROOT}/versions" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -print -exec rm -rf {} + 2>/dev/null || true
  date -Is > "${DEST_ROOT}/.last-backup-ok" || true
  echo "host=$(hostname) dry=${DRY_RUN}" >> "${DEST_ROOT}/.last-backup-ok" || true
fi

if [[ "${overall_rc}" -eq 0 ]]; then
  write_status success "ok ${DATESTAMP}"
  log "SUCCESS"
  notify_mail success "ok ${DATESTAMP}"
  exit 0
fi
if [[ "${overall_rc}" -eq 23 || "${overall_rc}" -eq 24 ]]; then
  write_status partial "rsync rc=${overall_rc}"
  log "PARTIAL rc=${overall_rc}"
  notify_mail partial "rsync rc=${overall_rc} — часть файлов не скопировалась"
  exit 0
fi
die "rsync rc=${overall_rc}"
