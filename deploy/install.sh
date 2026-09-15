#!/usr/bin/env bash
# VuelaClaim — instalación en un solo comando (Debian 12 / Ubuntu 24.04)
# Uso:  curl -fsSL https://gitlab.com/ismatv2001/reclama261/-/raw/main/deploy/install.sh | bash
#       o clonar y: sudo bash deploy/install.sh
set -euo pipefail

DOMAIN="${DOMAIN:-}"
PORT="${PORT:-8787}"
GIT_URL="${GIT_URL:-https://gitlab.com/ismatv2001/reclama261.git}"
APP_DIR="/opt/vuelaclaim"

if [ "$(id -u)" -ne 0 ]; then echo "Ejecuta con sudo"; exit 1; fi

echo "== 1/6 Instalando Node.js 22 =="
if ! command -v node >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== 2/6 Clonando VuelaClaim =="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$GIT_URL" "$APP_DIR"
fi

echo "== 3/6 Configurando servicio systemd =="
cat > /etc/systemd/system/vuelaclaim.service <<EOF
[Unit]
Description=VuelaClaim
After=network.target

[Service]
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
Environment=PORT=$PORT
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now vuelaclaim

echo "== 4/6 Firewall (ufw) =="
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable
fi

echo "== 5/6 nginx (opcional si hay dominio) =="
if [ -n "$DOMAIN" ]; then
  apt-get install -y nginx
  cat > /etc/nginx/sites-available/vuelaclaim <<EOF
server {
  listen 80;
  server_name $DOMAIN;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }
}
EOF
  ln -sf /etc/nginx/sites-available/vuelaclaim /etc/nginx/sites-enabled/vuelaclaim
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  echo "nginx listo para $DOMAIN (certbot: apt install certbot python3-certbot-nginx && certbot --nginx)"
fi

echo "== 6/6 Verificación =="
sleep 2
curl -fsS "http://127.0.0.1:$PORT/api/health" && echo && echo "VuelaClaim ACTIVO en http://$(hostname -I | awk '{print $1}'):$PORT"
