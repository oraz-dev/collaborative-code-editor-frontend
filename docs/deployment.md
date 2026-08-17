# Deployment

Live at **https://space.31.57.26.155.nip.io**

`nip.io` is wildcard DNS that resolves any `<anything>.<ip>.nip.io` to that IP —
no registrar, no DNS records, and Let's Encrypt issues for it. It is a stand-in
until a real domain exists; swapping to one means changing the hostname in the
Caddyfile and the two `CORS_ALLOWED_ORIGINS` values, nothing else.

## Shape

The server (`31.57.26.155`, Ubuntu) runs two docker-compose stacks, each with
its own Caddy:

| Stack | Caddy ports | Serves |
| --- | --- | --- |
| `documents-service` | 80, 443 | documents API — **and now the web app** |
| `auth-service` | 8080, 8443 | auth API |

The SPA is served by the *documents* stack's Caddy, because that one already
owns 80/443. Both APIs are reverse-proxied under the same hostname:

```
space.31.57.26.155.nip.io
  /api/auth/*  ->  auth-service:8080      (prefix stripped: it serves /auth/… and /users)
  /api/v1/*    ->  documents-service:8080 (prefix kept; also carries the ws upgrade)
  /*           ->  /srv/space             (static SPA, try_files -> index.html)
```

**One origin for everything** is the point. It means:
- no CORS preflights in normal operation,
- the `Secure; HttpOnly` refresh cookie is accepted (HTTPS) and is same-site,
  so `COOKIE_SAMESITE=none` is not needed,
- the client's relative `/api/auth` and `/api/v1` paths work unchanged from dev.

To reach the auth container across stacks, the documents Caddy is attached to
`auth-service_default` as an external network.

## Redeploying the frontend

```sh
pnpm build
scp -r dist/* root@31.57.26.155:/srv/space/
```

Static files only — no container restart, no downtime. Caddy serves them
straight from the bind mount.

## Server-side files

| Path | Purpose |
| --- | --- |
| `/srv/space` | built SPA (bind-mounted read-only into the Caddy container) |
| `/home/deploy/documents-service/Caddyfile` | the site block above |
| `/home/deploy/documents-service/docker-compose.prod.yml` | SPA mount + `authnet` |
| `/home/deploy/*/.env` | `CORS_ALLOWED_ORIGINS` on both services |
| `/root/deploy-backups/` | timestamped copies of everything changed |

## Certificates

Caddy provisions and renews Let's Encrypt certs automatically via HTTP-01 on
port 80, which it already owns. Nothing to do. Note `nip.io` is a shared
registered domain, so it is subject to Let's Encrypt rate limits — another
reason a real domain is worth having.

## Gotchas worth remembering

- **`.env` files must end with a newline.** Appending to one that doesn't
  silently merges the new line into the last comment, and the setting is
  ignored with no error.
- **Compose only re-reads `.env` on recreate.** `up -d` may report `Running`
  and change nothing; use `--force-recreate` for the service in question.
- **`CORS_ALLOWED_ORIGINS` must be passed through in `docker-compose.yml`.**
  The auth stack did not list it under `environment:`, so setting it in `.env`
  alone had no effect.

## Rollback

```sh
cd /home/deploy/documents-service
cp /root/deploy-backups/Caddyfile.<stamp> Caddyfile
cp /root/deploy-backups/docker-compose.prod.yml.<stamp> docker-compose.prod.yml
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps caddy
```

The `:80` block was left exactly as it was, so the API on the bare IP and the
swagger UI behave identically to before this change either way.

## Still open

`AUTH_SERVICE_URL` is unset on the documents service, so it cannot resolve
collaborator ids into names — this is the cause of the empty `username` /
`display_name` documented in `backend-gaps.md`, and it is a misconfiguration
rather than a service bug. Fixing it means attaching the documents *service*
container to `auth-service_default` and setting
`AUTH_SERVICE_URL=http://auth-service:8080`. The share dialog already
compensates client-side, so this is an improvement, not a blocker.
