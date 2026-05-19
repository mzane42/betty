#!/usr/bin/env bash
# Provision OVH VPS Debian 12 — run as root, one-shot.
set -euo pipefail

USERNAME="${USERNAME:-anis}"
SSH_PUBKEY="${SSH_PUBKEY:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root."
  exit 1
fi

echo "==> System update"
apt update && apt upgrade -y
apt install -y curl wget git ufw fail2ban htop ncdu tmux \
  ca-certificates gnupg lsb-release

echo "==> Docker install"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Create user $USERNAME"
if ! id "$USERNAME" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$USERNAME"
fi
usermod -aG sudo,docker "$USERNAME"
echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/"$USERNAME"
chmod 0440 /etc/sudoers.d/"$USERNAME"

echo "==> SSH key for $USERNAME"
mkdir -p /home/"$USERNAME"/.ssh
chmod 700 /home/"$USERNAME"/.ssh
if [ -n "$SSH_PUBKEY" ]; then
  echo "$SSH_PUBKEY" > /home/"$USERNAME"/.ssh/authorized_keys
elif [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys /home/"$USERNAME"/.ssh/authorized_keys
else
  echo "!! Aucune clé SSH trouvée — colle ta clé manuellement avant de désactiver root login."
fi
chmod 600 /home/"$USERNAME"/.ssh/authorized_keys 2>/dev/null || true
chown -R "$USERNAME":"$USERNAME" /home/"$USERNAME"/.ssh

echo "==> Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban"
systemctl enable --now fail2ban

echo "==> Harden SSH"
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl restart ssh

echo "==> Swap (2 Go si pas déjà)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "==> Unattended upgrades (sécurité auto)"
apt install -y unattended-upgrades apt-listchanges
dpkg-reconfigure -plow unattended-upgrades || true

echo "==> Stack dir"
mkdir -p /opt/stack
chown "$USERNAME":"$USERNAME" /opt/stack

echo ""
echo "==> DONE"
echo "Login désormais: ssh $USERNAME@<vps-ip>"
echo "Test sudo: sudo whoami → root"
echo "Suite: infra/docs/first-deploy.md étape 2"
