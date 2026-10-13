#!/usr/bin/env bash
# Prepare an Oracle Cloud Ubuntu VM (Always Free) for Coolify and install it.
#   ssh ubuntu@<server-ip> 'bash -s' < deploy/oracle-coolify-setup.sh
# Oracle's Ubuntu images ship iptables rules that REJECT everything except SSH, even when the
# VCN security list allows the port, so the ports Coolify needs are opened here as well.
set -euo pipefail

PORTS="80 443 8000 6001 6002"   # web, https, Coolify dashboard, realtime, terminal

echo "==> Opening ports in the VM firewall: $PORTS"
for p in $PORTS; do
  sudo iptables -C INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

echo "==> Adding 4 GB swap (helps builds on small VMs)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Installing Coolify (official installer)"
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash

IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
echo
echo "Coolify is installed. Open http://$IP:8000 and create the admin account straight away."
