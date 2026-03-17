#!/bin/bash
# vault-export.sh — Export the code vault to an external drive
#
# Usage:
#   ./scripts/vault-export.sh E:           # Export to E:\vault-backups\
#   ./scripts/vault-export.sh E: full      # Full repo archive (larger)
#   ./scripts/vault-export.sh E: diff      # Only files changed since vault (smaller)
#
# What it does:
#   1. Archives the vault branch into a dated zip file
#   2. Copies it to the specified drive
#   3. Verifies the copy
#
# The vault branch must exist. Run from the repo root.

set -e

# --- Arguments ---
DRIVE="${1}"
MODE="${2:-full}"  # "full" or "diff"

if [ -z "$DRIVE" ]; then
  echo "Usage: ./scripts/vault-export.sh <drive> [full|diff]"
  echo ""
  echo "  <drive>   Drive letter with colon (e.g., E:) or path (e.g., /mnt/usb)"
  echo "  full      Archive entire vault branch (default)"
  echo "  diff      Archive only files changed between vault and current HEAD"
  echo ""
  echo "Examples:"
  echo "  ./scripts/vault-export.sh E:"
  echo "  ./scripts/vault-export.sh E: diff"
  echo "  ./scripts/vault-export.sh /mnt/backup full"
  exit 1
fi

# --- Verify vault branch exists ---
if ! git rev-parse --verify vault >/dev/null 2>&1; then
  echo "ERROR: 'vault' branch does not exist."
  echo "Create it with: git branch vault <known-good-commit>"
  exit 1
fi

# --- Verify drive/path exists ---
BACKUP_DIR="${DRIVE}/vault-backups"
if [ ! -d "${DRIVE}/" ] && [ ! -d "${DRIVE}" ]; then
  echo "ERROR: Drive or path '${DRIVE}' not found."
  echo "Is the external drive plugged in and mounted?"
  exit 1
fi

# --- Setup ---
REPO_ROOT="$(git rev-parse --show-toplevel)"
VAULT_COMMIT="$(git rev-parse --short vault)"
VAULT_DATE="$(git log -1 --format='%ai' vault | cut -d' ' -f1)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
REPO_NAME="$(basename "$REPO_ROOT")"

mkdir -p "${BACKUP_DIR}"

echo "=== Code Vault Export ==="
echo "Vault commit:  ${VAULT_COMMIT} (${VAULT_DATE})"
echo "Current HEAD:  $(git rev-parse --short HEAD)"
echo "Export mode:   ${MODE}"
echo "Destination:   ${BACKUP_DIR}/"
echo ""

if [ "$MODE" = "diff" ]; then
  # --- Diff mode: only files changed since vault ---
  ARCHIVE_NAME="vault-diff_${TIMESTAMP}_${VAULT_COMMIT}.zip"
  ARCHIVE_PATH="${REPO_ROOT}/${ARCHIVE_NAME}"

  echo "Finding files changed between vault and HEAD..."
  CHANGED_FILES=$(git diff --name-only vault HEAD)

  if [ -z "$CHANGED_FILES" ]; then
    echo "No files changed between vault and HEAD. Nothing to export."
    exit 0
  fi

  FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
  echo "  ${FILE_COUNT} files changed"

  # Create zip with vault versions of changed files
  echo "Archiving vault versions of changed files..."
  git archive --format=zip vault -- $CHANGED_FILES > "${ARCHIVE_PATH}"

  # Also save the diff itself
  DIFF_FILE="${REPO_ROOT}/vault-to-head.diff"
  git diff vault HEAD > "${DIFF_FILE}"

  # Add diff to zip
  if command -v powershell >/dev/null 2>&1; then
    powershell -Command "
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      \$zip = [System.IO.Compression.ZipFile]::Open('${ARCHIVE_PATH}', 'Update')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(\$zip, '${DIFF_FILE}', 'vault-to-head.diff')
      \$zip.Dispose()
    " 2>/dev/null || echo "  (diff file not added to zip — add manually if needed)"
  fi
  rm -f "${DIFF_FILE}"

else
  # --- Full mode: entire vault branch ---
  ARCHIVE_NAME="vault-full_${TIMESTAMP}_${VAULT_COMMIT}.zip"
  ARCHIVE_PATH="${REPO_ROOT}/${ARCHIVE_NAME}"

  echo "Archiving full vault branch..."
  git archive --format=zip --prefix="${REPO_NAME}-vault/" vault > "${ARCHIVE_PATH}"
fi

# --- Copy to external drive ---
ARCHIVE_SIZE=$(du -h "${ARCHIVE_PATH}" | cut -f1)
echo ""
echo "Archive: ${ARCHIVE_NAME} (${ARCHIVE_SIZE})"
echo "Copying to ${BACKUP_DIR}/..."

cp "${ARCHIVE_PATH}" "${BACKUP_DIR}/${ARCHIVE_NAME}"

# --- Verify copy ---
if [ -f "${BACKUP_DIR}/${ARCHIVE_NAME}" ]; then
  ORIG_SIZE=$(stat -c%s "${ARCHIVE_PATH}" 2>/dev/null || stat -f%z "${ARCHIVE_PATH}" 2>/dev/null || echo "unknown")
  COPY_SIZE=$(stat -c%s "${BACKUP_DIR}/${ARCHIVE_NAME}" 2>/dev/null || stat -f%z "${BACKUP_DIR}/${ARCHIVE_NAME}" 2>/dev/null || echo "unknown")

  if [ "$ORIG_SIZE" = "$COPY_SIZE" ]; then
    echo "VERIFIED: Copy matches original (${ORIG_SIZE} bytes)"
  else
    echo "WARNING: Size mismatch! Original=${ORIG_SIZE}, Copy=${COPY_SIZE}"
  fi
else
  echo "ERROR: Copy failed — file not found at destination"
  rm -f "${ARCHIVE_PATH}"
  exit 1
fi

# --- Write manifest to drive ---
cat > "${BACKUP_DIR}/MANIFEST.txt" << MANIFEST_EOF
Code Vault Backup
=================
Repository:    ${REPO_NAME}
Vault commit:  ${VAULT_COMMIT}
Vault date:    ${VAULT_DATE}
Export date:    $(date '+%Y-%m-%d %H:%M:%S')
Export mode:    ${MODE}
Archive:       ${ARCHIVE_NAME}
HEAD at export: $(git rev-parse --short HEAD)

To restore from this vault:
  1. Unzip ${ARCHIVE_NAME}
  2. Or in the repo: git checkout vault -- <file-path>
  3. Or to reset vault: git branch -f vault ${VAULT_COMMIT}

Vault tags in repo:
$(git tag -l 'vault/*' 2>/dev/null || echo "  (none)")
MANIFEST_EOF

# --- Cleanup local archive ---
rm -f "${ARCHIVE_PATH}"

echo ""
echo "=== Export Complete ==="
echo "Backup:    ${BACKUP_DIR}/${ARCHIVE_NAME}"
echo "Manifest:  ${BACKUP_DIR}/MANIFEST.txt"
echo ""
echo "Previous backups on this drive:"
ls -lh "${BACKUP_DIR}"/vault-*.zip 2>/dev/null | tail -5 || echo "  (this is the first)"
