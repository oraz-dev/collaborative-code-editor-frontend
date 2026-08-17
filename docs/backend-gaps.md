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
| **Unrecognised `Origin` returns a bodyless 403** | Both services allowlist `Origin` and reject anything else with 403 and an *empty body* — only `http://localhost:3000` and `http://localhost:5173` are accepted. Any other dev port makes the whole app fail with an unexplainable error. The proxy now strips `Origin` so requests land in the accepted "no origin" case, but the allowlist should either cover local dev properly or return a body saying why. |
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

Most unbacked screens have now been removed rather than left rendering invented
data. What went, and what it would take to bring back:

| Removed | Needs |
| --- | --- |
| Notification bell + popover, and the notification toggles in Settings | `GET /notifications`, `POST /notifications/read-all`, plus an event feed. Unblocked by sharing now existing. |
| Settings → Team | `GET/POST /workspaces`, `/workspaces/{id}/members`, `/invites`. Documents would need a `workspace_id`. |
| Settings → Billing, and the Upgrade page | Plans, subscription state and invoices — realistically a payment provider. |
| Settings → General → Workspace name & URL | The same workspace API as above. |
| Profile → Connected accounts | Provider OAuth linking on the auth service. |
| Profile → Presence toggles | Would work today as local preferences, but they belonged with an account-level setting that has no endpoint. |
| Profile → Delete account | `DELETE /auth/me`. |
| Editor → Inline comments | The comments API below. |
| Editor → Terminal panel | Sandboxed execution over a streaming socket. |
| Editor → Git view (commit graph, branch status, Push) | Repo linking, provider OAuth, status/diff/commit/push. |
| Editor → Search view | `GET /documents/search?q=` — ⌘K covers the cached case today. |
| Workspace switcher subtitle ("Studio · Team") and its chevron | The workspace API above. |
| Auth page Privacy / Terms links | Real legal pages to link to. |
| Profile → avatar upload overlay | `POST /auth/me/avatar`. |

No demo fixtures remain: `src/shared/data/demo.ts` was deleted along with its
last three consumers, so every screen now renders real data or nothing.

**Comments** remain the most valuable thing to add — closest to the existing
model, and the editor already has a gutter to hang them on:
```
GET    /documents/{id}/comments          -> [{ id, author, line, body, created_at, resolved }]
POST   /documents/{id}/comments          { "line": 6, "body": "..." }
PATCH  /documents/{id}/comments/{cid}    { "resolved": true }
DELETE /documents/{id}/comments/{cid}
```

**Git integration** (`GitView`) — repo linking, provider OAuth, status/diff/commit/push.
**Terminal** — sandboxed execution over a streaming socket; its own project.

### Preferences are local on purpose

Theme, accent, editor and collaboration preferences live in `localStorage`
under `space:preferences`. They only need a backend if they should follow a
user across devices, which would be `GET`/`PATCH /auth/me/preferences` with a
free-form JSON blob.

## Suggested order

1. The three **confirmed defects** — all small, and the first one is visibly
   degrading the share dialog today.
2. `PATCH /auth/me`, so the profile screen stops being read-only.
3. **Comments**, then **notifications** — both are now unblocked by sharing.
4. Server-side search once workspaces get large enough for the cached-only
   ⌘K to feel thin.
5. Everything else as product priorities dictate.
