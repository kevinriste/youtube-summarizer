# Migration Guide: Next.js 14.2 → 15.5+ & ESLint 8 → 9.x

Reference document for Claude Code. Covers all breaking changes, required code modifications, and recommended migration order.

---

## Migration Order

1. **ESLint 8 → 9** (do this first, fewer entanglements)
2. **Next.js 14 → 15** (includes React 18 → 19, caching overhaul, async APIs)

---

## Part 1: ESLint 8.31 → 9.x

### 1.1 Node.js Requirement

ESLint 9 drops support for Node.js < v18.18.0 and all of v19.x. Minimum: Node.js 18.18.0+.

### 1.2 Flat Config Is Now Default (Biggest Change)

The `.eslintrc.*` / `.eslintrc.json` / `.eslintrc.js` config format is **deprecated**. ESLint 9 uses `eslint.config.js` (or `.mjs` / `.cjs`) by default — the "flat config" format.

**Escape hatch:** Set `ESLINT_USE_FLAT_CONFIG=false` to temporarily keep using legacy config. This will be removed in ESLint 10.

**Migration tool:** Run the official migrator to auto-convert:

```bash
npx @eslint/migrate-config .eslintrc.json
# Outputs eslint.config.mjs
```

**Key structural differences:**

| Aspect | eslintrc (v8) | flat config (v9) |
|--------|--------------|------------------|
| Config file | `.eslintrc.*` (multiple formats) | `eslint.config.js` / `.mjs` / `.cjs` |
| Config style | `extends` strings | Explicit JS imports, array of config objects |
| Plugins | String names: `plugins: ["react"]` | Object imports: `plugins: { react: reactPlugin }` |
| Parser | String: `parser: "@typescript-eslint/parser"` | Import: `languageOptions: { parser: tsParser }` |
| Env globals | `env: { browser: true }` | `languageOptions: { globals: { ...globals.browser } }` |
| Cascading | Merges `.eslintrc` files from ancestor dirs | Single config file only, no cascading |
| Ignores | `.eslintignore` file | `ignores` array in config objects |

**Flat config example (TypeScript + Next.js):**

```js
// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.flatConfig.coreWebVitals, // NOT legacy format
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // your rules
    },
  },
  {
    ignores: ["node_modules/", ".next/", "out/"],
  },
];
```

### 1.3 `@eslint/js` Replaces String Configs

```js
// ❌ Old (errors in ESLint 9 flat config)
export default ["eslint:recommended"];

// ✅ New
import js from "@eslint/js";
export default [js.configs.recommended];
```

### 1.4 FlatCompat for Legacy Plugins

If a plugin hasn't been updated for flat config, use the compatibility utility:

```js
import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends("some-legacy-config"),
  // ... rest of config
];
```

### 1.5 Removed Formatters

These built-in formatters were removed: `checkstyle`, `compact`, `jslint-xml`, `junit`, `tap`, `unix`, `visualstudio`. Install replacement npm packages if needed (e.g., `eslint-formatter-compact`).

### 1.6 Removed Rules

- `require-jsdoc` and `valid-jsdoc` — use `eslint-plugin-jsdoc` instead.

### 1.7 `eslint:recommended` Changes

**New rules enabled:**
- `no-constant-binary-expression`
- `no-empty-static-block`
- `no-new-native-nonconstructor`
- `no-unused-private-class-members`

**Rules removed from recommended:**
- `no-extra-semi`
- `no-inner-declarations`
- `no-mixed-spaces-and-tabs`
- `no-new-symbol`

### 1.8 Rule Behavior Changes

- **`no-unused-vars`**: `caughtErrors` now defaults to `"all"` (previously `"none"`). Unused `catch` variables will now error. Fix: use `_` prefix or set `caughtErrors: "none"`.
- **`no-unused-vars`**: `varsIgnorePattern` no longer applies to `catch` arguments. Use `caughtErrorsIgnorePattern` instead.
- **`no-implicit-coercion`**: Now also catches `-(-foo)` and `foo - 0`.
- **`no-useless-computed-key`**: Now flags unnecessary computed keys in classes by default.
- **`--quiet` flag**: No longer executes `"warn"` rules at all (performance improvement, but changes behavior if warn rules had side effects).

### 1.9 `parserOptions` → `languageOptions`

```js
// ❌ Old
{ parserOptions: { ecmaVersion: 2022, sourceType: "module" } }

// ✅ New
{ languageOptions: { ecmaVersion: 2022, sourceType: "module" } }
```

### 1.10 `.eslintignore` → Config-Level Ignores

`.eslintignore` files no longer work. Move ignore patterns into the config:

```js
export default [
  {
    ignores: ["dist/", "build/", "node_modules/", ".next/"],
  },
  // ... other config objects
];
```

### 1.11 Multiple `/* eslint */` Comments

Multiple inline `/* eslint */` comments for the same rule in one file are now **disallowed**. The first one wins; subsequent ones are reported as errors.

### 1.12 TypeScript-ESLint Package Changes

If using `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`, upgrade to the unified `typescript-eslint` package:

```bash
npm install typescript-eslint@latest
# Remove old packages:
npm uninstall @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

```js
import tseslint from "typescript-eslint";
export default tseslint.config(
  ...tseslint.configs.recommended,
);
```

---

## Part 2: Next.js 14.2 → 15.5+

### 2.1 Dependency Updates

```bash
npm install next@latest react@latest react-dom@latest eslint-config-next@latest
# TypeScript projects also:
npm install -D @types/react@latest @types/react-dom@latest
```

Or use the codemod CLI:

```bash
npx @next/codemod@canary upgrade latest
```

### 2.2 React 18 → 19 (Required)

Next.js 15 requires React 19. Key React 19 changes:

- **`useFormState` → `useActionState`**: `useFormState` is deprecated. `useActionState` adds a `pending` property.
- **`useFormStatus`**: Now includes `data`, `method`, and `action` keys.
- **`ref` as a prop**: Function components can accept `ref` as a regular prop (no more `forwardRef` needed in many cases).
- **Context as provider**: `<Context>` works directly as provider instead of `<Context.Provider>`.
- **Cleanup functions in refs**: Ref callbacks can return cleanup functions.
- **`use()` hook**: New hook for reading resources (promises, context) in render.
- **Hydration error improvements**: Much better error messages showing diffs.

**TypeScript:** Upgrade `@types/react` and `@types/react-dom` to latest.

### 2.3 Async Request APIs (CRITICAL BREAKING CHANGE)

Previously synchronous APIs are now **asynchronous** and must be `await`-ed:

- `cookies()`
- `headers()`
- `draftMode()`
- `params` (in layout, page, route, default, and metadata files)
- `searchParams` (in page files)

**Run the codemod:**

```bash
npx @next/codemod@canary next-async-request-api .
```

**Before (Next.js 14):**

```tsx
import { cookies } from "next/headers";

export default function Page() {
  const cookieStore = cookies();
  const token = cookieStore.get("token");
  return <div>{token?.value}</div>;
}
```

**After (Next.js 15):**

```tsx
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");
  return <div>{token?.value}</div>;
}
```

**Same pattern for headers:**

```tsx
const headersList = await headers();
```

**Same pattern for params and searchParams:**

```tsx
// Page component
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
}

// Layout component
export default async function Layout({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
}

// Route handler
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
}
```

**Temporary synchronous escape hatch** (shows dev warnings, will break in Next.js 16):

```tsx
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies;
```

> ⚠️ **Next.js 16 removes the synchronous fallback entirely.** Do the async migration now.

### 2.4 Caching Defaults Completely Changed (CRITICAL)

**This is the biggest behavior change.** Next.js 14 cached aggressively by default. Next.js 15 caches **nothing** by default.

#### fetch() requests

```tsx
// Next.js 14: cached by default (force-cache)
const data = await fetch("https://api.example.com/data");

// Next.js 15: NOT cached by default (no-store)
const data = await fetch("https://api.example.com/data");

// To opt into caching in Next.js 15:
const data = await fetch("https://api.example.com/data", {
  cache: "force-cache",
});
// Or with revalidation:
const data = await fetch("https://api.example.com/data", {
  next: { revalidate: 3600 },
});
```

#### GET Route Handlers

```tsx
// Next.js 14: cached by default (force-static)
export async function GET() {
  return Response.json({ data: "was cached" });
}

// Next.js 15: NOT cached by default (force-dynamic)
export async function GET() {
  return Response.json({ data: "dynamic every request" });
}

// To opt into caching:
export const dynamic = "force-static";
export async function GET() {
  return Response.json({ data: "now cached" });
}
```

#### Client Router Cache

- **Next.js 14**: Page segments cached for 30s (dynamic) / 5min (static)
- **Next.js 15**: `staleTime` defaults to **0** for page segments — always fetches fresh data on navigation

To restore old behavior:

```js
// next.config.js
module.exports = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};
```

> **Note:** `layout` segments still have a 5-minute default staleTime and are NOT refetched on navigation. Back/forward navigation still uses cache.

#### Impact Assessment

Search your codebase for:
- `fetch()` calls without explicit `cache` or `next.revalidate` options — these will now hit the network every time
- GET route handlers without `export const dynamic` — these are now dynamic
- Any performance assumptions based on automatic caching

### 2.5 `next/font` Changes

The `@next/font` package is removed. Use `next/font` instead (this was already the recommended import in 14.x).

### 2.6 `bundlePagesRouterDependencies`

Previously `experimental.bundlePagesRouterDependencies`, now stable as `bundlePagesRouterDependencies` at config root.

### 2.7 `serverExternalPackages`

Previously `experimental.serverComponentsExternalPackages`, now stable as `serverExternalPackages` at config root.

```js
// next.config.js
module.exports = {
  serverExternalPackages: ["package-name"],
};
```

### 2.8 Runtime Configuration Removed

`getServerSideProps`-era runtime config changes: the `runtime` export in `next.config.js` has changed. Check the official docs if you use custom runtime settings.

### 2.9 NextRequest Geolocation

`geo` and `ip` properties removed from `NextRequest`. These are now provider-specific:

```tsx
// ❌ Old
export function middleware(request: NextRequest) {
  const { city } = request.geo;
  const ip = request.ip;
}

// ✅ New (Vercel)
import { geolocation, ipAddress } from "@vercel/functions";
export function middleware(request: NextRequest) {
  const { city } = geolocation(request);
  const ip = ipAddress(request);
}
```

### 2.10 Speed Insights

`@vercel/speed-insights` auto-instrumentation removed from Next.js. Use the `@vercel/speed-insights` package directly.

### 2.11 ESLint Integration in Next.js 15

Next.js 15 adds ESLint 9 support. Key points:

- If you upgrade ESLint to 9 but still use `.eslintrc`, Next.js auto-applies `ESLINT_USE_FLAT_CONFIG=false`
- `eslint-plugin-react-hooks` upgraded to v5.0.0 (new rules for hooks usage)
- `eslint-config-next` should match your Next.js version
- For flat config with Next.js, use `@next/eslint-plugin-next`'s `flatConfig` export:

```js
import nextPlugin from "@next/eslint-plugin-next";
// Use: nextPlugin.flatConfig.coreWebVitals
// Do NOT also add @next/next to your plugins (causes "Cannot redefine plugin" error)
```

- Deprecated CLI options removed when running `next lint`: `--ext`, `--ignore-path`, `--resolve-plugins-relative-to`, `--rule-paths`, `--report-unused-disable-directives`

### 2.12 Server Actions Security

Next.js 15 creates **unguessable endpoints** for Server Actions and prunes unused actions from the client bundle. Existing Server Actions should continue working, but be aware that action IDs are no longer deterministic.

### 2.13 next.config.ts Support

Next.js 15 supports TypeScript config files (`next.config.ts`). Optional but nice for type safety:

```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // config
};
export default nextConfig;
```

---

## Part 3: Migration Checklist

### Pre-Migration

- [ ] Ensure Node.js ≥ 18.18.0
- [ ] Commit all current changes / create a branch
- [ ] Run existing tests to establish baseline
- [ ] Audit `package.json` for incompatible peer dependencies

### ESLint Migration

- [ ] Run `npx @eslint/migrate-config .eslintrc.json` to generate flat config
- [ ] Install `@eslint/js`, `globals` packages
- [ ] Update `typescript-eslint` to latest unified package
- [ ] Remove `.eslintrc.*` files and `.eslintignore`
- [ ] Move ignore patterns to `ignores` in config
- [ ] Replace string plugin references with object imports
- [ ] Replace `parserOptions` with `languageOptions`
- [ ] Replace `env` with `globals` imports
- [ ] Test with `npx eslint .` and fix new errors
- [ ] Check for `no-unused-vars` catch clause errors (new `caughtErrors: "all"` default)
- [ ] Verify all plugins support ESLint 9 flat config

### Next.js Migration

- [ ] Update `next`, `react`, `react-dom`, `eslint-config-next` to latest
- [ ] Update `@types/react` and `@types/react-dom`
- [ ] Run `npx @next/codemod@canary upgrade latest`
- [ ] Run `npx @next/codemod@canary next-async-request-api .`
- [ ] Manually verify all `cookies()`, `headers()`, `draftMode()` calls are `await`-ed
- [ ] Verify all `params` and `searchParams` are `await`-ed in pages/layouts/routes
- [ ] Audit `fetch()` calls — add `cache: "force-cache"` or `next: { revalidate: N }` where caching is needed
- [ ] Audit GET route handlers — add `export const dynamic = "force-static"` where needed
- [ ] Check for `request.geo` / `request.ip` usage in middleware
- [ ] Move `experimental.serverComponentsExternalPackages` → `serverExternalPackages`
- [ ] Move `experimental.bundlePagesRouterDependencies` → `bundlePagesRouterDependencies`
- [ ] Replace `useFormState` with `useActionState`
- [ ] Remove `forwardRef` where React 19 ref-as-prop can be used
- [ ] Update `eslint-config-next` and `@next/eslint-plugin-next` for flat config compatibility
- [ ] Run `next build` and fix any build errors
- [ ] Run `next dev` and check for async API warnings
- [ ] Test all dynamic routes, API routes, and middleware
- [ ] Performance test — verify caching changes don't cause regressions

### Useful Commands

```bash
# Upgrade codemod (handles deps + code transforms)
npx @next/codemod@canary upgrade latest

# Async API codemod
npx @next/codemod@canary next-async-request-api .

# ESLint config migration
npx @eslint/migrate-config .eslintrc.json

# Inspect your flat config visually
npx @eslint/config-inspector
```
