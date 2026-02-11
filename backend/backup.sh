#!/bin/sh
# PostureView automated PostgreSQL backup script
# Runs daily, keeps last 7 days of backups

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/postureview-${DATE}.sql.gz"

echo "[$(date)] Starting backup..."

# Create backup directory if not exists
mkdir -p "${BACKUP_DIR}"

# Run pg_dump and compress
pg_dump -h "${PGHOST}" -U "${PGUSER}" "${PGDATABASE}" | gzip > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup completed: ${BACKUP_FILE}"
    echo "[$(date)] Size: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
    echo "[$(date)] ERROR: Backup failed!"
    exit 1
fi

# Remove backups older than 7 days
echo "[$(date)] Cleaning old backups (keeping last 7 days)..."
find "${BACKUP_DIR}" -name "postureview-*.sql.gz" -mtime +7 -delete

echo "[$(date)] Remaining backups:"
ls -lh "${BACKUP_DIR}"/postureview-*.sql.gz 2>/dev/null || echo "  (none)"
echo "[$(date)] Done."
