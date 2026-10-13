#!/usr/bin/env bash
# Install the RxPOS Airtel relay on an Ubuntu VM with a static public IP (e.g. Oracle Cloud Always Free).
#   ssh ubuntu@<server-ip> 'sudo bash -s' < relay/setup-relay.sh
# Prints the relay address and key to save in Cloudflare (AIRTEL_RELAY_URL, AIRTEL_RELAY_KEY)
# and the IP to whitelist on the Airtel developer portal.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

IP=$(curl -fsS https://api.ipify.org)
HOST="${IP//./-}.sslip.io"   # free DNS name pointing at this IP, so Caddy can get an HTTPS certificate

echo "==> Opening ports 80/443 in the VM firewall (Oracle images block them by default)"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT
done
command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null || true

echo "==> Installing Node.js 20 and Caddy"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

echo "==> Installing the relay"
mkdir -p /opt/rxpos-relay
curl -fsSL "${RELAY_SOURCE:-https://raw.githubusercontent.com/DeeJayKyle/rxpos/main/relay/airtel-relay.mjs}" -o /opt/rxpos-relay/airtel-relay.mjs 2>/dev/null \
  || { echo "Could not download the relay (private repo?). Copy relay/airtel-relay.mjs to /opt/rxpos-relay/ first."; test -f /opt/rxpos-relay/airtel-relay.mjs; }
if [ ! -f /opt/rxpos-relay/relay.env ]; then
  echo "RELAY_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)" > /opt/rxpos-relay/relay.env
  chmod 600 /opt/rxpos-relay/relay.env
fi
id rxpos >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin rxpos
chown -R rxpos:rxpos /opt/rxpos-relay

cat > /etc/systemd/system/rxpos-relay.service <<EOF
[Unit]
Description=RxPOS Airtel payment relay
After=network-online.target
[Service]
User=rxpos
EnvironmentFile=/opt/rxpos-relay/relay.env
ExecStart=$(command -v node) /opt/rxpos-relay/airtel-relay.mjs --port 8787
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  reverse_proxy 127.0.0.1:8787
}
EOF

systemctl daemon-reload
systemctl enable --now rxpos-relay >/dev/null
systemctl restart caddy

echo "==> Waiting for the HTTPS certificate"
for i in $(seq 1 30); do curl -fsS "https://$HOST/health" >/dev/null 2>&1 && break; sleep 4; done
curl -fsS "https://$HOST/health" && echo

KEY=$(cut -d= -f2- /opt/rxpos-relay/relay.env)
echo
echo "RELAY_READY"
echo "PUBLIC_IP=$IP"
echo "AIRTEL_RELAY_URL=https://$HOST"
echo "AIRTEL_RELAY_KEY=$KEY"
