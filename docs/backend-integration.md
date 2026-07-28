# Backend integration

Two services back this app:

| Service   | Base URL (upstream)          | Dev path     |
| --------- | ---------------------------- | ------------ |
| Auth      | `http://31.57.26.155:8080`   | `/api/auth`  |
| Documents | `http://31.57.26.155/api/v1` | `/api/v1`    |

Swagger: [auth](http://31.57.26.155:8080/swagger/index.html) · [documents](http://31.57.26.155/swagger/index.html)

## Why everything goes through a proxy

Neither service sends CORS headers — an `OPTIONS` preflight returns `404` with no
`Access-Control-Allow-Origin`. A browser therefore **cannot call either service
directly**. `vite.config.ts` proxies both under the dev origin, which also makes
the `Secure` refresh cookie storable (localhost counts as a trustworthy origin
even over plain HTTP).

For production, either put both services behind one origin or have them start
sending CORS headers. `VITE_AUTH_BASE_URL` / `VITE_DOCS_BASE_URL` override the
paths; `VITE_AUTH_TARGET` / `VITE_DOCS_TARGET` override the dev proxy targets.

## Auth

- `POST /auth/login` returns **only** an access token; the refresh token comes
  back as an `HttpOnly; Secure` cookie (30 days).
- Access tokens live **15 minutes**, so silent refresh matters.
- `POST /auth/refresh` **rotates** the cookie on every call. Two concurrent
  refreshes would invalidate each other and sign the user out, so
  `shared/api/lib/httpClient` funnels every 401 through a single-flight refresh.
- The access token is kept **in memory only**. Durability comes from the cookie,
  so no long-lived credential is ever exposed to scripts.
- `POST /auth/register` issues no tokens, so the app signs in straight after.

## Documents

- Requests use `doc_name` / `doc_type`; responses return `docname` / `doctype`.
  `entities/Document` maps between the two.
- `POST /documents` requires `owner_id` even though the JWT already carries the
  user. Passing someone else's id is correctly rejected with 403.
- The create response contains zero-value timestamps
  (`0001-01-01T00:00:00Z`), so lists are refetched after a mutation.
- `doc_type` is **not validated** server-side — an unknown value returns 500,
  so the client restricts it to `file` / `folder`.
- **There is no rename endpoint.** Only content, move and delete exist, so the
  UI offers no rename.
- `yjs-state` is asymmetric: you `PATCH` a byte array but `GET` back base64.

## Collaboration socket

`GET /documents/{id}/ws?ticket=…`, where the ticket comes from
`POST /documents/{id}/ws-ticket` and expires in **15 seconds** — so a ticket is
minted per connection attempt, including every reconnect.

The server is a **plain broadcast relay**. It does not understand Yjs, never
answers a sync request itself, and holds no document state. Peers therefore sync
directly with each other (SyncStep1/SyncStep2 on join) and durable state is
loaded and saved through `/yjs-state`.

### The relay corrupts binary frames

Verified against the live server: every frame is re-emitted as a **text** frame,
and a single non-UTF-8 byte (e.g. `0xFF`) drops the *receiving* peer with close
code 1006. Raw Yjs updates are full of such bytes, so the stock `y-websocket`
provider disconnects every peer on the first real edit.

`features/collaboration/model/RelayProvider` works around this by base64-encoding
every protocol message. Confirmed end-to-end: concurrent edits converge, a late
joiner syncs from peers, non-ASCII and emoji survive intact, and the persisted
state round-trips exactly.

**The proper fix is server-side** — send binary frames (`websocket.BinaryMessage`
in Go) instead of stringifying the payload. Once that lands, the base64 layer can
be dropped.

### Other relay notes

- No echo: the sender does not receive its own message back.
- Delivery latency is ~200 ms–1.5 s and jittery; convergence is not instant.
- The relay tells a newcomer nothing about who else is present, so every peer
  answers a received SyncStep1 with its own awareness state.
- A heartbeat re-announces presence every 20 s, staying under the 30 s awareness
  timeout in `y-protocols` and doubling as an anti-entropy repair pass.
