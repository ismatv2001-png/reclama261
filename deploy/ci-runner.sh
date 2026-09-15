#!/usr/bin/env bash
# VuelaClaim — runner de CI propio en el VPS (sin cuota, sin límite)
# Instala un bucle que: hace pull, ejecuta scripts/ci.sh y guarda el recibo.
# Uso: sudo bash deploy/ci-runner.sh [intervalo_segundos]
set -euo pipefail
INTERVAL="${1:-900}"
APP_DIR="/opt/vuelaclaim"
LOG="/var/log/vuelaclaim-ci.log"

if [ "$(id -u)" -ne 0 ]; then echo "Ejecuta con sudo"; exit 1; fi
if [ ! -d "$APP_DIR/.git" ]; then echo "Falta $APP_DIR (ejecuta deploy/install.sh primero)"; exit 1; fi

cat > /usr/local/bin/vuelaclaim-ci <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd $APP_DIR
git pull --ff-only --quiet || true
bash scripts/ci.sh --soak >> $LOG 2>&1 || echo "CI falló \$(date -u)" >> $LOG
EOF
chmod +x /usr/local/bin/vuelaclaim-ci

cat > /etc/systemd/system/vuelaclaim-ci.service <<EOF
[Unit]
Description=VuelaClaim CI (runner propio, sin cuota)
After=network.target vuelaclaim.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/vuelaclaim-ci
EOF

cat > /etc/systemd/system/vuelaclaim-ci.timer <<EOF
[Unit]
Description=Temporizador CI VuelaClaim

[Timer]
OnBootSec=120
OnUnitActiveSec=${INTERVAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now vuelaclaim-ci.timer
echo "CI propio activo cada ${INTERVAL}s — log: $LOG"
echo "Recibos en $APP_DIR/data/receipts/"
