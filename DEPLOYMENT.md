# VoiceAI Deployment Guide

## Architecture

```
                    +-----------+
  Twilio SIP ------>| LiveKit   |<------- LiveKit Agent (Docker)
                    | Cloud     |         connects outbound via WSS
                    +-----------+
                         |
                    SIP trunk
                         |
  Browser ------->  Nginx :80/443  -----> Backend :3001  -----> Supabase Cloud
                    (frontend +            (Express API)
                     API proxy)
```

Three Docker containers:
- **agent** — Python LiveKit voice agent (`network_mode: host`)
- **backend** — Node.js Express API
- **frontend** — Nginx serving React SPA + reverse-proxying `/api/` to backend

---

## Prerequisites

Before starting, gather:

| Item | Where to get it |
|------|----------------|
| Domain name (e.g. `app.yourdomain.com`) | Any registrar |
| Oracle Cloud account (Free Tier) | [cloud.oracle.com](https://cloud.oracle.com) |
| Supabase project URL + keys | [supabase.com/dashboard](https://supabase.com/dashboard) |
| LiveKit Cloud project + API keys | [cloud.livekit.io](https://cloud.livekit.io) |
| OpenAI API key | [platform.openai.com](https://platform.openai.com) |
| Twilio Account SID + Auth Token + SIP Trunk | [twilio.com/console](https://twilio.com/console) |
| Resend API key (email notifications) | [resend.com](https://resend.com) |
| Sentry DSN (error monitoring) | [sentry.io](https://sentry.io) |

---

## Step 1: Provision the VM

### Oracle Cloud Free Tier (demo/staging)

1. Sign in to Oracle Cloud Console
2. **Compute > Instances > Create Instance**
3. Settings:
   - **Name**: `voiceai-prod`
   - **Region**: `eu-frankfurt-1` (or your nearest)
   - **Image**: Ubuntu 22.04 (Canonical)
   - **Shape**: `VM.Standard.A1.Flex` (ARM — permanent free tier)
   - **OCPUs**: 4, **Memory**: 24 GB
   - **Boot volume**: 50 GB (free tier default)
   - **SSH key**: Upload your public key
4. Under **Networking**, ensure the VCN has a public subnet
5. After creation, note the **Public IP**
6. Add **Ingress Rules** in the subnet's Security List:
   - TCP 22 (SSH)
   - TCP 80 (HTTP)
   - TCP 443 (HTTPS)
   - UDP 10000-60000 (LiveKit media — only needed if SIP media routes through this host)

### Hetzner CX22 (production)

1. Create a CX22 server (2 vCPU, 4 GB RAM, 40 GB disk) in Nuremberg
2. Select Ubuntu 22.04, add your SSH key
3. Add a firewall with the same port rules as above
4. Note the public IP

---

## Step 2: Server Setup

```bash
ssh ubuntu@<YOUR_VM_IP>

# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/<your-repo>/main/scripts/setup-server.sh | bash

# Log out and back in so Docker group takes effect
exit
ssh ubuntu@<YOUR_VM_IP>
```

Or manually:
```bash
git clone <your-repo-url> /opt/voiceai
cd /opt/voiceai
bash scripts/setup-server.sh
exit  # log out/in for docker group
```

---

## Step 3: Configure Environment

```bash
cd /opt/voiceai

# Agent environment
cp .env.local.example .env.local
nano .env.local
# Fill in: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
#          OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#          DEMO_CLINIC_ID, SENTRY_DSN, BACKEND_URL, AGENT_WEBHOOK_SECRET

# Backend environment
cp platform/backend/.env.example platform/backend/.env
nano platform/backend/.env
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_TRUNKING_SID,
#          STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY,
#          FROM_EMAIL, SENTRY_DSN, AGENT_WEBHOOK_SECRET
#          Set FRONTEND_URL=https://app.yourdomain.com

# Frontend build vars (Vite bakes these in at build time)
export VITE_SUPABASE_URL=https://your-project.supabase.co
export VITE_SUPABASE_ANON_KEY=eyJ...
export VITE_API_URL=https://app.yourdomain.com
```

---

## Step 4: Deploy

```bash
cd /opt/voiceai
./scripts/deploy.sh
```

This will build all three images and start the containers. First build takes 3-5 minutes.

Verify:
```bash
curl http://localhost/health
# {"status":"ok","timestamp":"..."}

curl http://localhost/api/agents
# {"error":"Unauthorized"} — correct, auth is working

docker compose logs agent --tail 50
# Should show LiveKit worker connecting
```

---

## Step 5: SSL with Certbot

Since the frontend container runs Nginx inside Docker on port 80, the simplest SSL approach is to use a **host-level Nginx** as a TLS-terminating reverse proxy:

```bash
# Install host nginx
sudo apt install -y nginx

# Stop the frontend container from binding port 80 directly
# Edit docker-compose.yml: change frontend ports to "8080:80"
# Then restart: docker compose up -d frontend
```

Configure host Nginx (`/etc/nginx/sites-available/voiceai`):
```nginx
server {
    listen 80;
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/voiceai /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d app.yourdomain.com

# Certbot auto-renews via systemd timer. Verify:
sudo systemctl list-timers | grep certbot
```

After Certbot runs, it modifies the host Nginx config to add SSL listeners and redirect HTTP to HTTPS automatically.

---

## Step 6: Configure Twilio Webhooks

In your Twilio Console:
1. Go to **Phone Numbers > Active Numbers > your number**
2. Set **Voice webhook** URL to: `https://app.yourdomain.com/api/calls/incoming`
3. Method: POST
4. For **SIP Trunk** voice URL, point to your LiveKit Cloud SIP endpoint (not this server)

---

## Updating the Agent

After pushing changes to `main`:

```bash
ssh ubuntu@<YOUR_VM_IP>
cd /opt/voiceai
./scripts/deploy.sh
```

That's it. The script pulls, rebuilds, and restarts only changed containers.

To restart a single service:
```bash
docker compose restart agent      # just the voice agent
docker compose restart backend    # just the API
```

To view logs:
```bash
docker compose logs -f agent      # follow agent logs
docker compose logs -f backend    # follow backend logs
docker compose logs frontend      # nginx access logs
```

---

## Migrating from Oracle to Hetzner

1. Provision Hetzner CX22 (Step 1 above)
2. Run `setup-server.sh` on the new server
3. Clone repo, copy `.env` files (same values, just update `FRONTEND_URL` / `BACKEND_URL` if domain changes)
4. Run `deploy.sh`
5. Update DNS A record to point to Hetzner IP
6. Run `certbot` on the new server
7. Update Twilio webhook URLs if the domain changed
8. Decommission Oracle VM

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `curl localhost/health` connection refused | `docker compose ps` — is frontend running? Check `docker compose logs frontend` |
| Agent not connecting to LiveKit | Check `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env.local` |
| Frontend shows blank page | Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were set before build |
| 502 Bad Gateway on `/api/` | Backend container not running or crashed — `docker compose logs backend` |
| Certbot fails | Ensure DNS A record points to this server's IP, and port 80 is open |
| Agent container exits immediately | `docker compose logs agent` — usually a missing env var or Python import error |
