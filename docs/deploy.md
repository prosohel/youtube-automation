# Deploying Automation Studio on a VM

Tested target: Ubuntu 22.04/24.04, 4 vCPU, 12 GB RAM, 200 GB disk, one domain, Cloudflare R2 for storage.
Everything runs in Docker: Caddy (HTTPS) → web (dashboard + API) → Redis, and a worker that makes and posts videos.

## 1. Server

```bash
# as root, once
apt update && apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
adduser studio && usermod -aG docker studio
```
Log in as `studio` from here on.

## 2. Domain

Create an **A record** for your domain (e.g. `studio.example.com`) pointing at the VM's IP. If the domain is on
Cloudflare, keep the record **DNS only (grey cloud)** until the first certificate is issued; orange cloud works
after that. Caddy gets the certificate from Let's Encrypt by itself.

## 3. Code and secrets

```bash
git clone <your repo> studio && cd studio
cp .env.example .env && nano .env
```
Set at least:

| Key | Value |
|---|---|
| `DOMAIN` | `studio.example.com` |
| `PUBLIC_URL` | `https://studio.example.com` |
| `DASHBOARD_PASSWORD` | 12+ characters |
| `TRUST_PROXY` | `1` |
| `STORAGE` | `r2` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from Cloudflare → R2 → Manage R2 API tokens (Object Read & Write, this bucket) |
| `CLAUDE_CODE_OAUTH_TOKEN` | run `claude setup-token` on your PC and paste the token (the server has no browser to log in) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | your voice |
| `REMOTION_GL` | `swangle` (software WebGL; the VM has no GPU) |
| `REMOTION_CONCURRENCY` | `3` on 4 vCPU |

`client_secret.json` (YouTube OAuth client) goes next to `.env`. It is imported into Redis on first start together with `.env`;
after that, change settings in the dashboard, not in the file.

## 4. OAuth redirect URLs

Add these to each developer console, replacing the domain:

| Platform | Where | Redirect URL |
|---|---|---|
| YouTube | Google Cloud → Credentials → OAuth client → Authorized redirect URIs | `https://studio.example.com/oauth2callback` |
| TikTok | TikTok for Developers → your app → Login Kit → Redirect URI | `https://studio.example.com/tiktok/callback` |
| Facebook / Instagram | Meta for Developers → app → Facebook Login → Valid OAuth Redirect URIs | `https://studio.example.com/meta/callback` (only if you use the login flow; page tokens from `.env` need none) |

Google shows the "unverified app" screen until the OAuth consent screen is published; add your account as a test user.
TikTok posts only to your own account until the app passes TikTok's audit. Meta posts to pages/IG accounts you admin in dev mode.

## 5. Start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f --tail=50 web worker
```
Open `https://studio.example.com`, log in with the password, connect each brand's YouTube/TikTok under Brands, set the
schedules. The first render downloads nothing (Chrome and fonts are in the image).

## 6. Storage (R2)

With `STORAGE=r2` every finished video, thumbnail and script is uploaded to the bucket under
`videos/<brand>/<video id>/`. The dashboard plays videos from R2 through signed links (1 hour). Local copies are
removed 3 days after the video is published everywhere (`R2_KEEP_DAYS`); if a publisher needs a file again, it is
downloaded back first. Cost: 10 GB free, then $0.015 per GB-month, no egress fees.

To look at the bucket: Cloudflare dashboard → R2 → bucket, or any S3 client with the same keys and endpoint
`https://<account id>.r2.cloudflarestorage.com`.

## 7. Day to day

- **Update:** `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- **Logs:** `docker compose logs -f worker` (renders, critique scores, posting)
- **Backups:** Redis data (settings, history, queue) is in the `redis-data` volume: `docker run --rm -v automation-studio_redis-data:/data -v $PWD:/b alpine tar czf /b/redis-$(date +%F).tgz /data`. Videos are in R2 already.
- **Disk:** `output/work/` holds render scratch per video; it is safe to delete folders older than a week.
- **Limits that matter at 6 videos a day:** YouTube's free quota (10,000 units/day ≈ 6 uploads per Google Cloud project; use one project per brand or request more), ElevenLabs credits (~700 per Bangla Short → ~130k a month), the Claude plan's usage window (3 calls per video).
