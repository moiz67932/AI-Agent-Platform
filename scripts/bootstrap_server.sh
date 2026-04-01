#!/bin/bash
set -e

echo "================================================"
echo " Agent Platform - Server Bootstrap"
echo " Server: $(hostname) | $(date)"
echo "================================================"

# STEP 1: System update
echo ""
echo "[1/7] Updating system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
echo "  OK: System updated"

# STEP 2: Install all required packages
echo ""
echo "[2/7] Installing required packages..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  python3 python3-pip python3-venv python3-dev \
  nginx supervisor git curl wget ufw \
  build-essential libssl-dev libffi-dev \
  libva2 libva-drm2 va-driver-all \
  certbot python3-certbot-nginx \
  net-tools lsof htop
echo "  OK: Packages installed"

# STEP 3: Firewall setup
echo ""
echo "[3/7] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 8000:8500/tcp comment 'Agent ports'
ufw --force enable
echo "  OK: Firewall configured"
ufw status numbered

# STEP 4: Directory structure
echo ""
echo "[4/7] Creating directory structure..."
mkdir -p /opt/agents
mkdir -p /opt/platform
mkdir -p /etc/nginx/agents.d
mkdir -p /var/log/agents
chmod 755 /opt/agents /opt/platform /var/log/agents
echo "  OK: Directories created"

# STEP 5: Nginx configuration
echo ""
echo "[5/7] Configuring Nginx..."
cat > /etc/nginx/sites-available/agents-platform << 'NGINXCONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location /health {
        return 200 'Agent Platform Server OK';
        add_header Content-Type text/plain;
    }

    location / {
        return 200 'Agent Platform Server OK';
        add_header Content-Type text/plain;
    }
}

include /etc/nginx/agents.d/*.conf;
NGINXCONF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/agents-platform \
  /etc/nginx/sites-enabled/agents-platform

nginx -t
systemctl enable nginx
systemctl restart nginx
echo "  OK: Nginx configured and running"

# STEP 6: Supervisor setup
echo ""
echo "[6/7] Configuring Supervisor..."
systemctl enable supervisor
systemctl start supervisor

cat > /etc/supervisor/conf.d/README << 'EOF'
Per-agent supervisor configs are written here automatically
by the platform deploy engine via SSH.
Each agent gets two processes:
  agent-{id}-webhook  -> FastAPI webhook server on assigned port
  agent-{id}-worker   -> LiveKit agent worker
EOF
echo "  OK: Supervisor configured and running"

# STEP 7: Install Python packages globally
echo ""
echo "[7/7] Installing Python packages..."
pip3 install --break-system-packages --quiet \
  fastapi \
  "uvicorn[standard]" \
  paramiko \
  twilio \
  livekit-agents \
  "livekit-plugins-openai" \
  "livekit-plugins-deepgram" \
  openai \
  asyncpg \
  resend \
  google-auth \
  google-auth-oauthlib \
  google-api-python-client \
  python-dotenv \
  tenacity \
  aiohttp \
  python-slugify \
  sentry-sdk \
  silero
echo "  OK: Python packages installed"

# Final verification
echo ""
echo "================================================"
echo " BOOTSTRAP COMPLETE"
echo "================================================"
echo "Nginx:      $(nginx -v 2>&1)"
echo "Supervisor: $(supervisord -v 2>/dev/null || echo 'running')"
echo "Python:     $(python3 --version)"
echo "UFW:        $(ufw status | head -1)"
echo ""
echo "Server is ready to receive agent deployments."
echo "Next: run the platform publish flow from your laptop."
echo "================================================"
