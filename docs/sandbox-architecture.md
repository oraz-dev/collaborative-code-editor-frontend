# Runnable workspaces — architecture

What it takes to turn this editor into something where **Run** produces a live
preview URL, with tenants separated hard enough to survive hostile code.

Sequencing is **sandbox first, tenancy after** — but tenancy is designed up
front, because retrofitting a tenant boundary through an execution layer that
never had one is the single most expensive mistake available here.

Today's stack is two Go services (auth, documents) behind one Caddy on one
Ubuntu box — see `deployment.md`. Everything below is new surface beside them.

---

## 1. What actually changes

The editor's current model is **documents**: a tree of rows in Postgres, each
holding text, synced by a Yjs relay. That is not a filesystem, and a build
needs a filesystem.

So the first real decision:

> **Yjs stays the editing model. A materialised filesystem becomes the build
> input.** They are not the same thing and must not be forced to be.

```
Yjs doc (live, per file)  ──snapshot──▶  workspace tarball  ──▶  sandbox rootfs
     ▲                                                                │
     └──────────── edits ────────────── editor                        ▼
                                                              preview URL
```

A run is a **snapshot**, not a live mount. The alternative — a network
filesystem the sandbox writes back through — means untrusted code holds a
writable handle into your primary datastore. Not worth it.

---

## 2. Service map

| Service | Responsibility | Trust |
| --- | --- | --- |
| `auth` | identity, tokens *(exists)* | trusted |
| `documents` | tree, Yjs state, sharing *(exists)* | trusted |
| **`orchestrator`** | run lifecycle, quotas, scheduling | trusted, internet-facing |
| **`builder`** | materialise snapshot → OCI image layer | trusted, no user code runs here |
| **`agent`** | one per sandbox host; starts/stops VMs | trusted, adjacent to hostile |
| **`preview-gateway`** | routes `*.preview.…` → running VM | trusted, internet-facing |
| **`egress-proxy`** | the only route out of a sandbox | trusted, chokepoint |
| *sandbox VM* | **the user's code** | **hostile** |

The reason for `builder` being separate from `agent`: dependency installation
(`pnpm install`, running lifecycle scripts) is *itself untrusted code
execution*. It gets the same sandbox treatment as a run. A "build service" that
runs `npm install` on a shared host with a shared cache is the most common way
these systems get owned.

---

## 3. The isolation boundary

Kernel-level, because the answer was "assume hostile code".

**Firecracker microVMs** as the default; gVisor as the cheaper fallback for
short non-network tasks.

```
┌─ host (bare metal or nested-virt capable) ──────────────┐
│  agent (root, minimal)                                  │
│                                                         │
│  ┌─ Firecracker VM ────────────────────────────────┐    │
│  │  guest kernel (own, not the host's)             │    │
│  │  rootfs: read-only base + ephemeral overlay     │    │
│  │  /workspace: snapshot, tmpfs or thin LV         │    │
│  │  vsock ──▶ agent (exec, logs, status)           │    │
│  │  tap0 ──▶ netns ──▶ egress-proxy only           │    │
│  └─────────────────────────────────────────────────┘    │
│  cgroup v2: cpu.max, memory.max, io.max, pids.max        │
│  seccomp on the Firecracker process itself               │
└─────────────────────────────────────────────────────────┘
```

Why a microVM and not a container: a container shares the host kernel, so every
kernel LPE is a tenant escape. Firecracker gives each workspace its own kernel
and a ~125 ms boot, which is fast enough to feel interactive.

Non-negotiables per VM:

- **No host network.** A tap device into a netns whose only route is the egress
  proxy. Explicitly block link-local `169.254.169.254` — cloud metadata
  credential theft is the first thing anyone tries.
- **Ephemeral writes.** Base rootfs read-only, overlay discarded on stop.
- **Hard caps.** vCPU, memory, disk, pids, wall-clock. A run that exceeds them
  is killed, not throttled into a support ticket.
- **No nested privilege.** No `CAP_SYS_ADMIN`, no docker socket, ever.
- **Egress allowlist.** Package registries yes; arbitrary internet no, or you
  are hosting a botnet and a crypto miner within the week.

### Snapshot-and-restore is the trick worth knowing

Firecracker can boot a VM, let it reach "node started, deps resolved", then
snapshot memory + disk. Restoring that snapshot is tens of milliseconds. So the
expensive part of a cold start happens **once per base image**, not per run.
This is the difference between "Run" feeling instant and feeling like CI.

---

## 4. Run lifecycle

```
POST /api/v1/workspaces/{id}/runs
        │
        ├─ orchestrator: quota check, concurrency check, admission
        ├─ documents:    export Yjs docs → tar (content-addressed)
        ├─ builder:      cache hit on lockfile digest?
        │                   hit  → reuse layer
        │                   miss → sandboxed install → push layer
        ├─ agent:        restore snapshot, attach /workspace, exec start command
        ├─ gateway:      bind {run}.preview.example.com → VM:port
        └─◀ 201 { run_id, preview_url, logs_ws }
```

Logs and status stream over a websocket, exactly like the existing collaboration
relay — the client already knows this shape.

Idle runs are reaped aggressively (default 30 min, less on free tiers). A
preview URL that outlives its VM returns a "wake this workspace" page rather
than a 502; waking is a snapshot restore, so it is fast.

### Caching, where the real cost lives

Three layers, keyed by content:

1. **Base images** — `node:22`, `python:3.13`, … built by you, pinned, scanned.
2. **Dependency layers** — keyed by a hash of the lockfile. Shared across
   *all* tenants, because the input is a public registry and the output is
   deterministic. Never share a *writable* cache; only immutable layers.
3. **Workspace snapshot** — per workspace, keyed by the Yjs state vector.

Miss all three and a cold start is ~30 s. Hit them and it is under a second.

---

## 5. Preview routing

`{run-id}.preview.example.com` — **a separate registrable domain, not a
subdomain of the app.**

This matters more than it looks. If previews are served from
`*.space.example.com`, hostile user code sets `document.domain`, drops cookies
on the parent domain, and reads anything scoped to it. A distinct eTLD+1 puts
the browser's own origin model between tenants, for free.

The gateway terminates TLS on a wildcard cert, looks the run id up, and proxies
to the VM's tap address. Websocket upgrades pass through — user apps have their
own HMR sockets.

---

## 6. Tenancy — designed now, built after

Even though the sandbox ships first, these columns land **before** it, or
everything above gets rewritten.

```sql
workspaces      (id, name, slug, plan, created_at)
workspace_members (workspace_id, user_id, role)   -- owner|admin|member|viewer
documents       (… , workspace_id NOT NULL)       -- the retrofit
runs            (id, workspace_id, status, …)
```

Enforcement, in order of how much you can trust it:

1. **Postgres row-level security** keyed off a per-request
   `SET LOCAL app.workspace_id`. A forgotten `WHERE` clause then returns zero
   rows instead of another tenant's data. This is the one that saves you.
2. Repository-layer scoping in Go — the everyday path.
3. Handler-level checks — the layer everyone writes and everyone eventually
   forgets somewhere.

Quotas hang off the workspace: concurrent runs, monthly CPU-seconds, storage,
egress bytes. The orchestrator refuses admission rather than letting the bill
find you.

**The migration is the hard part**, not the schema. Existing documents have no
workspace. Backfill: one personal workspace per user, `owner_id` → owner
membership, then `NOT NULL`. Do it before there is real traffic.

---

## 7. Frontend

Comparatively small, because the editor already exists.

| Piece | Notes |
| --- | --- |
| `features/run` | start/stop, status, log stream over ws — mirrors `RelayProvider` |
| `widgets/PreviewPane` | sandboxed `<iframe>`, device sizes, URL bar, reload |
| `widgets/Terminal` | xterm.js against the log/exec socket; the removed panel returns |
| `widgets/RunConsole` | build output, exit codes, timings |
| `entities/Workspace` | switcher, members, invites — the removed Team screen returns |

Two things worth getting right:

- The preview iframe gets `sandbox="allow-scripts allow-same-origin allow-forms"`
  **and** a foreign origin. The attribute alone is not a boundary.
- Layout becomes a three-pane split (tree │ editor │ preview). The tab strip and
  status bar just built are the right chrome for it; the status bar gains a run
  indicator.

`useCollaborativeDocument` is untouched. Editing and running stay independent —
you can edit while a run is live, and the next run picks up a fresh snapshot.

---

## 8. What this costs

Being blunt, because this is the part that decides whether it happens:

- **Firecracker needs bare metal or nested virt.** The current single shared
  Ubuntu box cannot host it. This is a real infrastructure change, not a new
  container in the compose file.
- **Sandbox hosts are a fleet with a lifecycle** — draining, patching, capacity
  planning, an agent to keep alive on each.
- **The security boundary needs ongoing attention**: base image CVE scanning,
  egress rules, abuse detection, kernel updates.
- **Roughly**: a thin but genuinely isolated version is a few months of focused
  backend work. The frontend is weeks.

Cheaper routes, if that is too much:

| Option | Trade |
| --- | --- |
| **WebContainers** (in-browser WASM Node) | No sandbox fleet at all — the browser is the boundary. Node/web stacks only, needs COOP/COEP headers. By far the fastest path to a working demo. |
| **Managed sandboxes** (E2B, Daytona, Modal) | Someone else operates the isolation. You keep the orchestrator, lose the host fleet. |
| **gVisor + containers** | Weaker than a microVM, much simpler to run. Reasonable for trusted-ish users, not for open signups. |

---

## 9. Order of work

1. `workspaces` + `workspace_members` + `documents.workspace_id`, with RLS and
   the backfill. Cheap now, brutal later.
2. Preview domain and gateway, stubbed against a plain container.
3. Orchestrator with the run lifecycle and quotas — no real isolation yet.
4. Frontend: run controls, log stream, preview pane, terminal.
5. Swap the stub executor for Firecracker + agent. **Ship nothing public before
   this step.**
6. Snapshot restore and the dependency layer cache — the difference between
   usable and pleasant.
7. Team UI: members, invites, roles.

Steps 1–4 are ordinary product work. Step 5 is the one that needs someone who
enjoys kernels.
