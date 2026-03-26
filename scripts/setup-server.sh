#!/usr/bin/env bash
# setup-server.sh — First-time server provisioning for Ubuntu 22.04+ (Oracle ARM / Hetzner).
# Usage: ssh into your VM, then: bash setup-server.sh
# Run as a user with sudo privileges (not root directly).

set -euo pipefail

echo "=========================================="
echo " VoiceAI Server Setup"
echo "=========================================="

# 1. System update
echo "==> Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 2. Install Docker via official convenience script
echo "==> Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    # Allow current user to run docker without sudo
    sudo usermod -aG docker "$USER"
    echo "    Docker installed. You may need to log out/in for group to take effect."
else
    echo "    Docker already installed, skipping."
fi

# 3. Install Docker Compose v2 (comes as a Docker plugin now)
echo "==> Ensuring Docker Compose v2..."
if ! docker compose version &>/dev/null; then
    sudo apt install -y docker-compose-plugin
fi
docker compose version

# 4. Install Certbot for SSL certificates
echo "==> Installing Certbot..."
sudo apt install -y certbot

# 5. Configure firewall (UFW)
echo "==> Configuring firewall..."
sudo apt install -y ufw

# SSH — always allow so we don't lock ourselves out
sudo ufw allow 22/tcp

# HTTP + HTTPS for web traffic
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# UDP range for LiveKit media (RTP/RTCP)
sudo ufw allow 10000:60000/udp

# Enable firewall (--force skips the interactive prompt)
sudo ufw --force enable
sudo ufw status

# 6. Create application directory
echo "==> Creating /opt/voiceai..."
sudo mkdir -p /opt/voiceai
sudo chown "$USER":"$USER" /opt/voiceai

echo ""
echo "=========================================="
echo " Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. cd /opt/voiceai"
echo "  2. git clone <your-repo-url> ."
echo "  3. cp .env.local.example .env.local && nano .env.local"
echo "  4. cp platform/backend/.env.example platform/backend/.env && nano platform/backend/.env"
echo "  5. Export frontend build vars: export VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... VITE_API_URL=..."
echo "  6. ./scripts/deploy.sh"
echo ""
echo "NOTE: If you just installed Docker, log out and back in first"
echo "      so the 'docker' group membership takes effect."
