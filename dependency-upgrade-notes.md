# Dependency Upgrade Notes: Tricky Packages

Companion to the Next.js 16 / ESLint 10 migration guide. Covers the non-obvious upgrade paths for other dependencies in yt-transcribe.

---

## 1. MUI 5.11 → 7.3 (High Friction — Skipping v6 Entirely)

You're jumping two majors. The changes accumulate.

### v5 → v6 Changes (You'll Hit These)

- **`theme.palette.mode` pattern replaced.** `theme.palette.mode === 'dark'` is replaced by `theme.applyStyles('dark', { ... })`. Run codemods:
  ```bash
  npx @mui/codemod@latest v6.0.0/styled .
  npx @mui/codemod@latest v6.0.0/sx-prop .
  npx @mui/codemod@latest v6.0.0/theme-v6 .
  ```
- **Accordion summary wrapped in `<h3>` by default.** Can break CSS specificity if targeting the old DOM structure.
- **Grid v2 stabilized with CSS `gap`** instead of margin/padding spacing. Import changes from `@mui/material/Unstable_Grid2` to `@mui/material/Grid2`.
- **UMD bundle removed** (unlikely to affect you).

### v6 → v7 Changes (You'll Also Hit These)

- **Deep imports broken.** The Node.js `exports` field now enforces single-level imports only:
  ```tsx
  // ❌ Errors in v7
  import createTheme from '@mui/material/styles/createTheme';
  // ✅ Correct
  import { createTheme } from '@mui/material/styles';
  ```
  Search the entire codebase for any two-level-deep MUI imports.

- **`slots`/`slotProps` standardized.** The old `TransitionComponent`/`TransitionProps` pattern on Accordion, Dialog, etc. is replaced:
  ```tsx
  // ❌ Old
  <Accordion TransitionComponent={CustomTransition} TransitionProps={{ unmountOnExit: true }} />
  // ✅ New
  <Accordion slots={{ transition: CustomTransition }} slotProps={{ transition: { unmountOnExit: true } }} />
  ```

- **`Hidden` component removed.** Replace with `useMediaQuery`:
  ```tsx
  // ❌ Old
  <Hidden xlUp><Paper /></Hidden>
  // ✅ New
  const hidden = useMediaQuery(theme => theme.breakpoints.up('xl'));
  return hidden ? null : <Paper />;
  ```

- **Deprecated v5 APIs removed:**
  - `createMuiTheme` → `createTheme`
  - `experimentalStyled` → `styled`
  - `onBackdropClick` prop on Dialog/Modal → use `onClose` with reason check:
    ```tsx
    const handleClose = (event, reason) => {
      if (reason === 'backdropClick') {
        // Handle backdrop click
      }
      setOpen(false);
    };
    <Dialog open={open} onClose={handleClose} />
    ```

- **CSS class rename:** `MuiRating-readOnly` → `Mui-readOnly`

- **TypeScript module augmentation paths changed:**
  ```tsx
  // ❌ Old
  declare module '@mui/material/styles/createTypography' {
    interface TypographyOptions { /* ... */ }
    interface Typography { /* ... */ }
  }
  // ✅ New
  declare module '@mui/material/styles' {
    interface TypographyVariantsOptions { /* ... */ }
    interface TypographyVariants { /* ... */ }
  }
  ```

### Recommended Approach

Run the v6 codemods first even though you're going straight to v7 — they handle the `theme.applyStyles` and `sx` prop transformations that carry through:

```bash
npx @mui/codemod@latest v6.0.0/styled .
npx @mui/codemod@latest v6.0.0/sx-prop .
npx @mui/codemod@latest v6.0.0/theme-v6 .
```

Then install v7 and fix any remaining deep import or slots issues manually.

---

## 2. `framer-motion` 6.5 → 12.34 (Medium — Package Renamed)

The library was renamed from `framer-motion` to `motion` starting at v11.11. Your "after" `package.json` still shows `framer-motion` at v12 — this works because the `framer-motion` npm package still publishes, but it's essentially a shim now. The recommended move is:

```bash
npm uninstall framer-motion
npm install motion
```

Then update all imports:

```tsx
// ❌ Old
import { motion, AnimatePresence } from "framer-motion";
// ✅ New
import { motion, AnimatePresence } from "motion/react";
```

### Breaking Changes Accumulated Across v7–v12

- **v7**: React 18 minimum (you're going to 19, so fine)
- **v8**: Pointer event polyfill removed — `DragControls.start` only accepts `onPointerDown` events now, not `onMouseDown`/`onTouchStart`
- **v5** (you're on v6, but double-check): `AnimateSharedLayout` removed — use `layoutId` prop directly
- **v10–v11**: `MotionValue` velocity calculation changed — synchronous `.set()` calls within the same frame no longer compound velocity
- **v12**: No React breaking changes specifically, just the rename

The React API itself is remarkably stable across versions. If you're just using `<motion.div>`, `AnimatePresence`, and basic animation props, it's likely a clean rename-and-go.

---

## 3. `@emotion/server` — Possibly Remove It

This one's subtle. `@emotion/server` is for extracting critical CSS during Pages Router SSR using `_document.tsx`.

### If Using App Router

You don't need `@emotion/server` at all. Use `@mui/material-nextjs` instead, which handles Emotion cache injection via `useServerInsertedHTML`:

```bash
npm install @mui/material-nextjs
```

```tsx
// app/layout.tsx
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AppRouterCacheProvider>
          {children}
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

### If Using Pages Router

Keep `@emotion/server` but use the `@mui/material-nextjs/v15-pagesRouter` helpers instead of raw Emotion server extraction.

### Turbopack Hydration Warning

There is a known hydration error with Emotion + MUI + Turbopack (which is now the default bundler in Next.js 16). If you hit hydration mismatches in dev, try `next dev --webpack` to confirm it's Turbopack-related, then check the [emotion-js/emotion#3308](https://github.com/emotion-js/emotion/issues/3308) issue for the latest fix. This is one of the sharper edges in the whole migration.

---

## 4. TypeScript 4.9 → 5.9 (Low-Medium)

The jump itself is usually smooth, but a few things to watch:

- **`moduleResolution: "bundler"`** — new option that better matches how Next.js actually resolves modules. Consider switching from `"node"` to `"bundler"` in `tsconfig.json`.
- **`verbatimModuleSyntax`** — replaces `isolatedModules` and `importsNotUsedAsValues`. More strict about type-only imports (`import type { X }` vs `import { X }`).
- **Decorator metadata changes** — unlikely to affect you unless using decorators.
- **React 19 types** (`@types/react` 19.x) changed some signatures:
  - `ReactNode` now includes `undefined`
  - `useRef` requires an explicit initial value or uses `useRef<T>(null)` with a `MutableRefObject`
  - `forwardRef` is less necessary (ref is a regular prop in React 19)

---

## 5. The Rest (Low/No Friction)

- **`openai` ^6.6.0** — already on v6, no major jump
- **`react-markdown` ^9.1.0** — staying within v9, clean
- **`gpt-tokenizer`**, **`html-entities`**, **`@uandi/video-id`**, **`youtube-transcript-plus`** — utility packages, no breaking changes in the ranges shown

---

## Fix in Your "After" `package.json`

Your scripts still show `"lint": "next lint"` — that command is removed in Next.js 16. Update to:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

---

## Recommended Migration Order

1. **ESLint 8 → 10** (already covered in the main migration guide)
2. **MUI 5 → 7** with codemods (run v6 codemods first, then install v7)
3. **`framer-motion` → `motion`** rename
4. **Verify Emotion SSR setup** matches your router type (App Router vs Pages Router)
5. **Next.js 14 → 16** last (MUI/Emotion hydration issues are easier to debug when the component library is already stable)

This order minimizes the chance of debugging compound issues — each step is independently testable before moving to the next.
