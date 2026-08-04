# Backend integration

Two services back this app:

| Service   | Base URL (upstream)          | Dev path     |
| --------- | ---------------------------- | ------------ |
| Auth      | `http://31.57.26.155:8080`   | `/api/auth`  |
| Documents | `http://31.57.26.155/api/v1` | `/api/v1`    |

Swagger: [auth](http://31.57.26.155:8080/swagger/index.html) · [documents](http://31.57.26.155/swagger/index.html)

## CORS and the proxy

Both services now send proper CORS headers — preflight returns 204, the origin
is echoed back, and **auth sets `Access-Control-Allow-Credentials: true`**,
which its refresh cookie needs.

The Vite proxy in `vite.config.ts` is therefore no longer strictly required, but
it is kept for dev because the refresh cookie is `Secure`: served through
`localhost` it is stored (localhost counts as a trustworthy origin), whereas a
cross-origin plain-HTTP backend would have it dropped. Production should serve
the app over HTTPS or keep a same-origin gateway.

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
- `GET /users?query=` searches by username, display name or email (email is
  matched but never returned). `GET /users?ids=a,b,c` resolves a batch of ids;
  unknown ids are omitted rather than erroring. Exactly one parameter may be given.

## Documents

- Requests use `doc_name` / `doc_type`; responses return `docname` / `doctype`.
  `entities/Document` maps between the two.
- `POST /documents` requires `owner_id`, which must match the caller.
- The create response still contains zero-value timestamps
  (`0001-01-01T00:00:00Z`), so lists are refetched after a mutation.
- `yjs-state` is asymmetric: you `PATCH` a byte array but `GET` back base64.
- `PATCH /documents/{id}` renames. Owner only.

## Sharing and roles

Access is `owner` / `editor` / `viewer`, and **a grant covers the whole
subtree** — sharing a folder shares everything inside it, including through
`children` and `ws-ticket`.

- Only the owner may share, and only `editor` or `viewer` may be granted;
  requesting `owner` is rejected with 400.
- Sharing with someone who already has access **updates their role** instead of
  failing, so `POST /collaborators` doubles as an upsert.
- A collaborator may remove *themselves* (leaving a document), while the owner
  may remove anyone. The owner's own access cannot be revoked.
- `GET /documents/shared-with-me` is the counterpart to `/roots`; a shared
  document lives in the owner's tree, so it never appears among your own roots.
- `GET /documents/{id}/collaborators` lists **direct** grants only — someone who
  inherits access from a parent folder is listed on that folder.

**Known bug:** the document service returns collaborators with empty `username`
and `display_name`, even while auth resolves those same users fine. The share
dialog works around it by batch-resolving unresolved ids through
`GET /users?ids=`. Once the service populates them, that fallback becomes a
no-op and can be removed.

## Collaboration socket

`GET /documents/{id}/ws?ticket=…`, where the ticket comes from
`POST /documents/{id}/ws-ticket` and expires in ~15 seconds — so a ticket is
minted per connection attempt, including every reconnect.

The ticket response carries `role` and `can_edit`, which the client uses to open
the editor read-only. The server enforces the same thing: a viewer gets 403 on
`PATCH /content`, `PATCH /yjs-state` and rename.

The server is a **plain broadcast relay**. It does not understand Yjs, never
answers a sync request itself, and holds no document state. Peers sync directly
with each other (SyncStep1/SyncStep2 on join) and durable state is loaded and
saved through `/yjs-state`.

Frames are now relayed as **binary, byte-exact** — verified end to end, including
`0xFF`. The client sends binary and still *accepts* base64 text on receive so a
rollout needs no flag day; that legacy branch in `RelayProvider.decodeFrame` can
be deleted once every client is updated.

### Viewers are send-blocked

The relay drops everything a viewer's connection sends — verified. That has one
non-obvious consequence: a viewer **cannot ask peers for a sync**, so if they
join against a snapshot older than the edits now arriving, Yjs holds those
updates pending and their text silently stops moving.

`useCollaborativeDocument` handles this by re-pulling `/yjs-state` every 15s
while the user is a viewer and the tab is visible. The fresher snapshot supplies
the missing base and the pending updates integrate themselves. Editors don't
need it — they stay current over the socket.

### Other relay notes

- No echo: the sender does not receive its own message back.
- Delivery is best-effort, ~200 ms–1.5 s and jittery; convergence is not instant.
- The relay tells a newcomer nothing about who else is connected, so every peer
  answers a received SyncStep1 with its own awareness state.
- A heartbeat re-announces presence every 20 s, staying under the 30 s awareness
  timeout in `y-protocols` and doubling as an anti-entropy repair pass.
