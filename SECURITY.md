# Security

## Report a vulnerability

Please do not open a public issue for a security problem.

Report it privately with GitHub's
[**Report a vulnerability**](https://github.com/prosohel/youtube-automation/security/advisories/new) form
(Security tab > Advisories). Include what you found, how to reproduce it and what an attacker could do.

You should get a reply within a week. Once a fix is released, you will be credited unless you ask not to be.

Fixes go into the latest version on `main`. Older versions are not patched.

## What users should know

This app holds credentials that can post to your accounts, so:

- **The dashboard has no login.** By default it listens on `127.0.0.1` only. Setting `HOST=0.0.0.0`, changing
  the Docker port mapping, or putting it behind a public reverse proxy lets anyone who can reach it change
  settings, replace your keys and publish videos. Do not expose it to the internet.
- **Secrets live in two places:** your local `.env`, `client_secret.json` and `token.json`, and the Redis
  volume (`redis-data`) after the dashboard imports them. Treat both as sensitive. Do not share the volume or
  a Redis dump.
- **Never commit real keys.** `.env`, `client_secret.json`, `token.json` and `history.json` are in
  `.gitignore`. If a key does reach a commit, a log or an issue, revoke it at the provider straight away;
  removing it from git afterwards is not enough.

## Especially useful reports

- Any way to read stored secrets through the API (`/api/settings` must only return masked values).
- Path traversal in `/api/media` or in footage and import handling.
- Any request that makes the worker run commands or fetch URLs chosen by an attacker.
