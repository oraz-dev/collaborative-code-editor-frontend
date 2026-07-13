# Project: My SaaS Dashboard

## Tech Stack

- React 19 + TypeScript 6
- SCSS Modules for component-scoped styles (`.module.scss`)
- Redux Toolkit for global state management
- React Query for server state
- Vite 8 as build tool
- Vitest + Testing Library for tests

## File Structure (Feature-Sliced Design)

```
src/
  app/           # App entry, global styles, providers
  pages/         # Route-level page components
  widgets/       # Composite UI blocks (AppBar, Navigator, etc.)
  shared/
    ui/          # Reusable UI components
    lib/         # Utilities and helpers
    data/        # Demo/mock data
    assets/      # SVG icons and static assets
```

## Naming Conventions

- Components: PascalCase → `UserCard.tsx`
- Hooks: camelCase with "use" prefix → `useUserData.ts`
- Event handlers: `handleXxx` pattern → `handleSubmit`
- Always add TypeScript types - no implicit `any`

## Code Style (Ulbi TV / Production Project Style)

Follow this exact coding style in all components and modules:

### Component Pattern
- Wrap components in `memo()` for performance
- Use `forwardRef` when a component needs to forward refs (e.g. Button, Input)
- Props interface defined directly above the component, with `className?: string` always included
- Destructure props inside the component body, NOT in the function signature when there are many props
- Spread `...otherProps` onto the root/native element for extensibility
- Default export for lazy-loaded components, named export for everything else
- Import SCSS module as `cls` → `import cls from './Component.module.scss'`

### classNames Utility
- Use the `classNames(mainClass, mods, additional)` pattern everywhere:
  ```tsx
  classNames(cls.Button, { [cls.disabled]: disabled }, [className, cls[variant]])
  ```
- `mods` = object of conditional classes (`Record<string, boolean | undefined>`)
- `additional` = array of always-applied extra classes

### Import Order
1. Third-party libraries (`react`, `react-i18next`, `react-redux`, etc.)
2. Absolute imports from `@/shared/...`, `@/entities/...`, `@/features/...`, `@/widgets/...`
3. Relative imports from `../../model/...` (selectors, slices, types, services)
4. SCSS module import last → `import cls from './Component.module.scss'`

### Redux / State Management Style
- Each selector in its own file: `model/selectors/getSomething/getSomething.ts`
- Each selector has its own test file next to it
- Slice exports destructured: `export const { actions: fooActions } = fooSlice` and `export const { reducer: fooReducer } = fooSlice`
- Use `createAsyncThunk` for async operations, in `model/services/serviceName/serviceName.ts`
- Type schema interfaces in `model/types/schemaName.ts`

### FSD Module Structure (per feature/entity)
```
FeatureName/
  index.ts              # Public API barrel - ONLY export what other modules need
  model/
    types/              # TypeScript interfaces/types
    selectors/          # One selector per folder, with test
    slices/             # Redux slices
    services/           # Async thunks
    consts/             # Constants and enums
  ui/
    ComponentName/
      ComponentName.tsx
      ComponentName.module.scss
      ComponentName.stories.tsx   # Storybook stories
```

### JSX / Rendering Style
- Use `VStack` / `HStack` (flex wrappers) for layout instead of manual flex divs
- `gap="8"` / `gap="16"` as string props on Stack components
- `max` prop on Stack for `width: 100%`
- Conditional rendering with `{condition && <Component />}` (short-circuit)
- `data-testid` attributes on testable elements

### Props & Types Style
- Variant/theme props as string union types: `type ButtonVariant = 'clear' | 'outline' | 'filled'`
- Size props as string literals: `type ButtonSize = 'm' | 'l' | 'xl'`
- Addon pattern for composable slots: `addonLeft?: ReactNode`, `addonRight?: ReactNode`
- Extend native HTML attributes: `interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>`
- Use `Omit<>` to remove conflicting native props before extending

### Callbacks
- Wrap all callbacks in `useCallback` with proper dependency arrays
- Event handler naming: `onChangeUsername`, `onLoginClick`, `onOpenDrawer`, etc.

## Commands

```sh
pnpm dev         # start dev server
pnpm build       # production build
pnpm test        # run all tests
pnpm lint        # eslint check
```

## Rules

- NEVER commit directly to main
- NEVER use inline styles - SCSS modules only
- NEVER add `console.log` - use `shared/lib/logger/logger.ts`
- ALL async functions must have try/catch error handling
- ALL interactive elements need aria labels
- Every component must have a corresponding test file
