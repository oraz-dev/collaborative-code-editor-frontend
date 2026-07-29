# What the backend still needs

Conventions assumed throughout: `Bearer` auth, snake_case bodies, `{ "error": "..." }`
on failure, document routes under `/api/v1`.

Items marked **verified** were confirmed against the live services; the rest are
derived from UI that currently renders demo data.

---

## Tier 0 — blocks the core product

### 1. Document sharing (the big one)

**Verified:** documents are owner-only. A second account gets `403 "you do not
have access to this document"` on read, on `ws-ticket`, and on content update.
`/documents/roots` returns only what you own.

This means the collaborative editor cannot currently be used by two people. The
CRDT, presence and socket all work, but only for one account in multiple tabs.
Everything else on this page is cosmetic next to this.

```
POST   /documents/{id}/collaborators   { "user_id": "...", "role": "editor" }  -> 201
GET    /documents/{id}/collaborators   -> [{ user_id, username, display_name, avatar_url, role }]
PATCH  /documents/{id}/collaborators/{user_id}  { "role": "viewer" }           -> 200
DELETE /documents/{id}/collaborators/{user_id}                                 -> 204
GET    /documents/shared-with-me       -> [Document]
```

Notes:
- `role`: `owner` | `editor` | `viewer`. `viewer` should be rejected on
  `PATCH /content`, `PATCH /yjs-state` and treated as read-only by `ws-ticket`
  (or given a read-only ticket), so the client can disable editing.
- Sharing needs user lookup to be usable: `GET /users?query=` returning
  `[{ id, username, display_name, avatar_url }]`, so you can invite by
  username/email instead of pasting a UUID.
- Access checks must apply to the whole subtree — sharing a folder should share
  what is inside it, otherwise the file tree half-loads for the invitee.

### 2. CORS

**Verified:** an `OPTIONS` preflight returns `404` with no
`Access-Control-Allow-*` headers, on both services. Browsers therefore cannot
call either service cross-origin at all.

The app only works today because Vite proxies both under the dev origin. Any
deployment where the frontend is not same-origin needs:

```
Access-Control-Allow-Origin: <app origin>   (not *, credentials are involved)
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
```

…and `OPTIONS` answered with 204 on every route.

### 3. Binary WebSocket frames

**Verified:** the relay re-emits every frame as a **text** frame, and one
non-UTF-8 byte (e.g. `0xFF`) drops the receiving peer with close code 1006.

Yjs updates are full of such bytes, so the client base64-encodes every protocol
message to survive the trip — about 33% more traffic than necessary. Sending
`websocket.BinaryMessage` instead of stringifying the payload removes the
workaround entirely (see `RelayProvider`).

Also worth having, though the client copes without them:
- The relay tells a newcomer nothing about who else is connected, so every peer
  answers a received SyncStep1 with its own awareness state. A server-side
  "who is in this room" message would be cheaper.
- Delivery is best-effort with ~200 ms–1.5 s latency and no ordering guarantee.
  Peers self-repair via a periodic SyncStep1, but server-side fan-out ordering
  would reduce the churn.

---

## Tier 1 — gaps in features that are already wired

| Need | Endpoint | Why |
| --- | --- | --- |
| Rename a document | `PATCH /documents/{id}` `{ "doc_name": "..." }` | **Verified missing.** Only content/move/delete exist, so the UI offers no rename at all. |
| Update profile | `PATCH /auth/me` `{ display_name, username, avatar_url }` | Profile fields are read-only because nothing can save them. |
| Avatar upload | `POST /auth/me/avatar` (multipart) -> `{ avatar_url }` | `UserResponse` has `avatar_url` but no way to set it. |
| Server-side search | `GET /documents/search?q=&limit=` | ⌘K currently ranks only what the client has cached — roots plus opened folders. It cannot find a file in a folder you have never opened. |
| Validate `doc_type` | reject unknown values with 400 | **Verified:** an unknown `doc_type` currently returns `500 internal server error`. |
| Timestamps on create | populate `created_at` / `updated_at` in the 201 body | **Verified:** create returns `0001-01-01T00:00:00Z`, so the client refetches purely to learn when things happened. |
| Trash / restore | `GET /documents/trash`, `POST /documents/{id}/restore` | Delete is already a soft delete, but nothing can list or undo it. |

---

## Tier 2 — what the remaining demo UI would need

These are the screens still rendering fixed data. Listed roughly by how much
they'd add.

**Comments** (`CommentsMargin`) — arguably the most valuable of these for a
collaborative editor, and the closest to the existing data model:
```
GET    /documents/{id}/comments          -> [{ id, author, line, body, created_at, resolved }]
POST   /documents/{id}/comments          { "line": 6, "body": "..." }
PATCH  /documents/{id}/comments/{cid}    { "resolved": true }
DELETE /documents/{id}/comments/{cid}
```

**Notifications** (bell + popover) — needs an event feed plus unread state, and
realistically a socket or poll to stay live:
```
GET   /notifications?unread=            -> [{ id, actor, kind, target, created_at, read }]
POST  /notifications/read-all
```
Depends on sharing existing first — every notification in the mock ("invited you
to…", "replied to your comment", "requested your review") presupposes it.

**Teams / workspaces** (`WorkspaceSwitcher`, Settings → Team) — the switcher's
"Studio · Team" label and the members/invites lists:
```
GET/POST  /workspaces
GET       /workspaces/{id}/members
POST      /workspaces/{id}/invites       { "email": "...", "role": "..." }
DELETE    /workspaces/{id}/members/{user_id}
```
Documents would need a `workspace_id` to belong to one.

**Activity feed** (dashboard side rail) — `GET /activity` over documents you can
see. Cheap once sharing and an event table exist.

**User preferences** (Settings → General/Editor) — `GET`/`PATCH /auth/me/preferences`
with a free-form JSON blob. Could equally live in `localStorage`; it only needs
a backend if settings should follow you across devices.

**Git integration** (`GitView`, branch/commit UI) — a genuine subsystem: repo
linking, OAuth against a provider, status/diff/commit/push. Large, and
independent of everything above.

**Terminal** (`Terminal`) — needs sandboxed execution with a streaming socket.
The largest and riskiest item here by a wide margin; treat as its own project.

**Billing** (`UpgradePage`, Settings → Billing) — plans, subscription state and
invoices, almost certainly a payment provider rather than something hand-rolled.

---

## Suggested order

1. **Sharing + user lookup** — without it the product's premise doesn't hold.
2. **CORS** — without it nothing ships anywhere but a proxied dev box.
3. **Binary frames** — small server change, deletes a client workaround.
4. **Rename, profile update, `doc_type` validation, create timestamps** — small
   fixes to things already built.
5. **Comments**, then **notifications** — the highest-value demo screens, and
   both become meaningful only once sharing exists.
6. Everything else as product priorities dictate.
