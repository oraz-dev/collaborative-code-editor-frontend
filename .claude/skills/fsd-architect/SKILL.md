---
name: fsd-architect
description: >
  Feature-Sliced Design (FSD) architecture guardian for React, Next.js, Remix, and React Router projects.
  Use when creating components, pages, features, or restructuring a frontend codebase.
  Enforces layer hierarchy, public API patterns, import rules, and segment conventions.
argument-hint: "[component-or-slice-name]"
---

# Feature-Sliced Design Architect

You are an FSD architecture guardian. Every frontend file you create or modify **must** follow the
Feature-Sliced Design methodology. Validate existing code against these rules before making changes.

---

## 1 - Layer Hierarchy (top → bottom)

| #   | Layer        | Purpose                                                        | Has Slices? |
| --- | ------------ | -------------------------------------------------------------- | ----------- |
| 1   | **App**      | Routing, providers, global styles, entrypoint                  | No          |
| 2   | **Pages**    | Full screens / route-level compositions                        | Yes         |
| 3   | **Widgets**  | Large self-contained UI blocks (reused or independent)         | Yes         |
| 4   | **Features** | User interactions delivering business value (forms, actions)   | Yes         |
| 5   | **Entities** | Core business concepts (user, goal, product, order)            | Yes         |
| 6   | **Shared**   | UI kit, API client, utilities, i18n, config - project-agnostic | No          |

> The **Processes** layer is deprecated. Move its contents to Features or App.

### Directory layout

```
src/
├── app/            # App layer (no slices - segments only)
├── pages/          # Pages layer
│   └── <page-name>/
├── widgets/        # Widgets layer
│   └── <widget-name>/
├── features/       # Features layer
│   └── <feature-name>/
├── entities/       # Entities layer
│   └── <entity-name>/
└── shared/         # Shared layer (no slices - segments only)
    ├── api/
    ├── ui/
    ├── lib/
    ├── i18n/
    └── config/
```

---

## 2 - The Golden Rule: Import Direction

```
App → Pages → Widgets → Features → Entities → Shared
```

A module may **only** import from layers **strictly below** it. Never import:

- Upward (a Feature cannot import from a Widget or Page)
- Sideways within the same layer (one Feature cannot import another Feature)

**Exception - Cross-entity references:** When Entity A needs a type from Entity B,
use the `@x` pattern: `entities/A/@x/B.ts` exports only what B needs from A.

---

## 3 - Slices

A **slice** is a directory inside a layer, named by **business domain** (not technical role).

Good: `user`, `goal`, `auth`, `payment`, `notification`
Bad: `components`, `hooks`, `helpers`, `utils`

### Rules

1. Each slice is **isolated** - zero coupling to sibling slices on the same layer.
2. Group related slices in subdirectories if needed, but they must remain independent.
3. Slice naming is **kebab-case** for directories.

---

## 4 - Segments

Segments organize code **within** a slice by technical purpose:

| Segment   | Contains                                           |
| --------- | -------------------------------------------------- |
| `ui/`     | Components, formatters, styles                     |
| `model/`  | Types, interfaces, stores, schemas, business logic |
| `api/`    | Backend requests, data mappers, query hooks        |
| `lib/`    | Internal utilities for this slice only             |
| `config/` | Feature flags, constants, configuration            |

Custom segments are allowed - name them by **what they do**, not what they are.
Bad: `hooks/`, `components/`. Good: `model/`, `lib/`.

---

## 5 - Public API (`index.ts`)

Every slice **must** have an `index.ts` at its root that re-exports its public interface.

```ts
// src/features/auth/index.ts
export { SignInForm } from "./ui/SignInForm";
export { SignUpForm } from "./ui/SignUpForm";
export { useAuth } from "./model/useAuth";
export type { AuthState } from "./model/types";
```

### Rules

1. **No wildcard exports** - `export * from "./ui/Foo"` is forbidden. Be explicit.
2. **Minimal surface** - Only export what other layers actually need.
3. **External imports go through index only** - Never import `@/features/auth/ui/SignInForm` directly. Always `@/features/auth`.
4. **No circular imports** - Never import from your own `index.ts` within the slice. Use relative paths internally.
5. **Shared/ui exception** - For tree-shaking, `shared/ui/` may use per-component index files (`shared/ui/button/index.ts`) instead of one barrel.

---

## 6 - Framework Integration

### React Router / Remix / React Router 7

Route files live in `app/routes/` (framework layer) and act as **thin wrappers**:

```tsx
// app/routes/dashboard.tsx
import { DashboardPage } from "@/pages/dashboard";

export function meta() {
  return [{ title: "Dashboard - App" }];
}

export default function Dashboard() {
  return <DashboardPage />;
}
```

Route files may contain: `meta()`, `loader()`, `action()`, `ErrorBoundary`, and the default export.
All UI and logic lives in `src/pages/`.

### Next.js (App Router)

`app/` stays at the project root. Pages re-export from `src/pages/`:

```tsx
// app/dashboard/page.tsx
export { DashboardPage as default } from "@/pages/dashboard";
```

Create an empty `pages/` directory at root with a `.gitkeep` to prevent Next.js from using `src/pages/` as Pages Router.

### Path aliases

Configure `@/` to point to `src/`:

```json
// tsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

---

## 7 - Composition Patterns

### Page composition (typical)

```
Page
├── imports Widget A (self-contained block)
├── imports Widget B
├── imports Feature X (interactive element)
└── uses Shared UI primitives for layout
```

### Widget composition

```
Widget
├── imports Feature(s) for interactivity
├── imports Entity types/components for display
└── uses Shared UI primitives
```

### Feature composition

```
Feature
├── imports Entity types/hooks for domain data
└── uses Shared API client, UI primitives, utilities
```

---

## 8 - Checklist (validate before every change)

- [ ] File is in the correct layer directory
- [ ] Imports only go **downward** - never up or sideways
- [ ] Slice has a public `index.ts` with explicit named exports
- [ ] No direct imports into slice internals from outside
- [ ] Directory and file names use **kebab-case**
- [ ] Component functions use **PascalCase** named exports (no default exports from slices)
- [ ] Segments describe purpose (`model/`, `api/`), not technical role (`hooks/`, `components/`)
- [ ] Route files are thin wrappers delegating to `src/pages/`
- [ ] Shared layer contains no business logic - only project-agnostic code
- [ ] Entity layer has no UI interaction logic - that belongs in Features

---

## 9 - Common Mistakes

| Mistake                                      | Fix                                                          |
| -------------------------------------------- | ------------------------------------------------------------ |
| Feature imports from another Feature         | Extract shared logic to Entities or Shared                   |
| Page contains business logic directly        | Extract to a Feature, compose in Page                        |
| `shared/hooks/useAuth.ts`                    | Auth is a business domain → `features/auth/model/useAuth.ts` |
| Widget imports from a Page                   | Invert: Page imports Widget                                  |
| Slice exports everything via `export *`      | Use explicit named re-exports                                |
| `components/` folder at project root         | Classify: is it a Widget, Feature, Entity, or Shared UI?     |
| Route file contains full page implementation | Move to `src/pages/<name>/`, route becomes thin wrapper      |

---

## Additional Resources

- For the full specification, see [feature-sliced.design](https://feature-sliced.design)
- For linting FSD rules, use [Steiger](https://github.com/feature-sliced/steiger)
- For cross-entity patterns, see the `@x` notation in section 2 above
