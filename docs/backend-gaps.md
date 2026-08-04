# What the backend still needs

**Tier 0 is done and verified end to end.** Sharing with subtree inheritance and
role enforcement, CORS on both services, rename, binary websocket frames and
`GET /users` all shipped. Two separate accounts now edit one document and
converge — that was impossible before.

Conventions: `Bearer` auth, snake_case bodies, `{ "error": "..." }` on failure,
document routes under `/api/v1`.

---

## Confirmed defects

| Issue | Detail |
| --- | --- |
| **Collaborator profiles come back empty** | `GET /documents/{id}/collaborators` returns `username` and `display_name` as `""`, even though auth resolves those exact ids fine via `GET /users?ids=`. The share dialog batch-resolves them client-side; once fixed, that fallback becomes a no-op. |
| **Create returns zero-value timestamps** | `POST /documents` still answers `0001-01-01T00:00:00Z` for `created_at`/`updated_at`, so the client refetches after every create purely to learn when things happened. |
| **`doc_type` is still unvalidated** | An unknown value (`"banana"`) returns `500 internal server error` rather than 400. The client restricts it to `file`/`folder` to avoid tripping this. |

## Still missing

| Need | Endpoint | Why |
| --- | --- | --- |
| Update profile | `PATCH /auth/me` `{ display_name, username }` | Currently 404. Profile fields are read-only because nothing can save them. |
| Avatar upload | `POST /auth/me/avatar` -> `{ avatar_url }` | `UserResponse` exposes `avatar_url` but nothing can set it. |
| Server-side document search | `GET /documents/search?q=&limit=` | ⌘K ranks only what the client has cached — roots plus opened folders — so it cannot find a file in a folder you have never opened. |
| Trash / restore | `GET /documents/trash`, `POST /documents/{id}/restore` | Delete is already a soft delete, but nothing can list or undo it. |

## Worth having on the relay

The client copes without these, but they'd simplify it:

- **A "who is in this room" message.** The relay tells a newcomer nothing about
  who else is connected, so every peer answers a received SyncStep1 with its own
  awareness state.
- **A read-only sync path for viewers.** Viewer sends are dropped entirely
  (correct for writes), which also means a viewer cannot request a sync. If they
  joined against a stale snapshot, Yjs holds incoming updates pending and their
  text stops moving. The client works around it by re-pulling `/yjs-state` every
  15s while read-only. Letting a viewer send *sync-protocol* messages — but not
  document updates — would remove the polling.
- Delivery is best-effort at ~200 ms–1.5 s with no ordering guarantee. Peers
  self-repair via a periodic SyncStep1, but server-side fan-out ordering would
  reduce the churn.

Once every client ships binary frames, the base64 branch in
`RelayProvider.decodeFrame` can be deleted.

---

## The remaining demo UI

These screens still render fixed data, listed roughly by value.

**Comments** (`CommentsMargin`) — the most valuable of these for a collaborative
editor and closest to the existing model:
```
GET    /documents/{id}/comments          -> [{ id, author, line, body, created_at, resolved }]
POST   /documents/{id}/comments          { "line": 6, "body": "..." }
PATCH  /documents/{id}/comments/{cid}    { "resolved": true }
DELETE /documents/{id}/comments/{cid}
```

**Notifications** (bell + popover) — an event feed plus unread state, and a
socket or poll to stay live:
```
GET   /notifications?unread=            -> [{ id, actor, kind, target, created_at, read }]
POST  /notifications/read-all
```
Now unblocked: every notification in the mock ("invited you to…", "requested
your review") presupposes sharing, which exists.

**Teams / workspaces** (`WorkspaceSwitcher`, Settings → Team) — the "Studio ·
Team" label and the members/invites lists:
```
GET/POST  /workspaces
GET       /workspaces/{id}/members
POST      /workspaces/{id}/invites       { "email": "...", "role": "..." }
DELETE    /workspaces/{id}/members/{user_id}
```
Documents would need a `workspace_id` to belong to one.

**Activity feed** (dashboard side rail) — `GET /activity` over documents you can
see. Cheap once an event table exists.

**User preferences** (Settings → General/Editor) — `GET`/`PATCH /auth/me/preferences`
with a free-form JSON blob. Could equally live in `localStorage`; it only needs a
backend if settings should follow you across devices.

**Git integration** (`GitView`) — a genuine subsystem: repo linking, provider
OAuth, status/diff/commit/push. Large and independent of everything above.

**Terminal** (`Terminal`) — sandboxed execution with a streaming socket. The
largest and riskiest item here; treat as its own project.

**Billing** (`UpgradePage`, Settings → Billing) — plans, subscription state and
invoices, almost certainly a payment provider rather than something hand-rolled.

---

## Suggested order

1. The three **confirmed defects** — all small, and the first one is visibly
   degrading the share dialog today.
2. `PATCH /auth/me`, so the profile screen stops being read-only.
3. **Comments**, then **notifications** — both are now unblocked by sharing.
4. Server-side search once workspaces get large enough for the cached-only
   ⌘K to feel thin.
5. Everything else as product priorities dictate.
