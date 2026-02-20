# Migration Guide: Next.js 14.2 → 16.1.6 & ESLint 8 → 10.0.0

Comprehensive reference for Claude Code. Supersedes the previous 14→15 / ESLint 8→9 guide. Covers all breaking changes across both major version boundaries and the recommended migration order.

---

## Migration Order

1. **Ensure Node.js ≥ 20.19.0** (required by ESLint 10; also needed for Next.js 16)
2. **ESLint 8 → 9 → 10** (do this first — ESLint changes are config-only and don't touch application code)
3. **Next.js 14 → 15 → 16** (includes React 18 → 19.2, caching overhaul, async APIs, Turbopack default, `next lint` removal)

> **Important:** Next.js 16 removes `next lint` entirely and expects you to run ESLint directly. Getting ESLint sorted first means you have a working `eslint .` command before touching Next.js.

---

## Part 1: ESLint 8.31 → 10.0.0

You're crossing two major versions. The overwhelming majority of work is the 8→9 flat config migration. The 9→10 jump is small if flat config is done right.

### 1.1 Node.js Requirement

- ESLint 9: Node.js ≥ 18.18.0
- ESLint 10: Node.js ≥ 20.19.0 (also drops 21.x and 23.x)

**Action:** Verify `node --version` is ≥ 20.19.0 before starting. Update Docker images, CI runners, etc.

### 1.2 Flat Config Replaces eslintrc (ESLint 9 Change, ESLint 10 Removes Escape Hatch)

The `.eslintrc.*` / `.eslintrc.json` / `.eslintrc.js` format is deprecated in ESLint 9 and **completely removed in ESLint 10**. There is no `ESLINT_USE_FLAT_CONFIG=false` fallback anymore. You must migrate to `eslint.config.js` (or `.mjs` / `.cjs`).

**Step 1 — Run the official migrator to generate a starting point:**

```bash
npx @eslint/migrate-config .eslintrc.json
# Outputs eslint.config.mjs
```

The migrator aggressively uses `FlatCompat` wrappers. After it runs, review the output and simplify where possible — many plugins now natively support flat config and don't need the compat layer.

**Step 2 — Install new core packages:**

```bash
npm install -D @eslint/js globals
```

**Step 3 — Delete legacy files:**

- `.eslintrc`, `.eslintrc.json`, `.eslintrc.js`, `.eslintrc.cjs`, `.eslintrc.yml`, `.eslintrc.yaml`
- `.eslintignore` (move patterns into config — see section 1.6)

**Key structural differences:**

| Aspect | eslintrc (v8) | flat config (v9/v10) |
|--------|--------------|----------------------|
| Config file | `.eslintrc.*` (multiple formats) | `eslint.config.js` / `.mjs` / `.cjs` (single file) |
| Config style | `extends` strings | Explicit JS imports, array of config objects. ESLint 10+ also supports `defineConfig` with `extends` sugar. |
| Plugins | String names: `plugins: ["react"]` | Object imports: `plugins: { react: reactPlugin }` |
| Parser | String: `parser: "@typescript-eslint/parser"` | Import: `languageOptions: { parser: tsParser }` |
| Env globals | `env: { browser: true, node: true }` | `languageOptions: { globals: { ...globals.browser, ...globals.node } }` |
| Cascading | Merges `.eslintrc` files from ancestor dirs | Single config file, no cascading. ESLint 10 changes lookup to start from each linted file's directory (useful for monorepos). |
| Ignores | `.eslintignore` file | `ignores` array in config objects |

### 1.3 TypeScript-ESLint Package Migration

If using the old split packages (`@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`), migrate to the unified `typescript-eslint` package:

```bash
npm uninstall @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install -D typescript-eslint@latest
```

Usage in flat config:

```js
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  // or for stricter checking:
  // ...tseslint.configs.strict,
];
```

`typescript-eslint` exports its own `config()` helper that handles parser setup automatically.

### 1.4 `@eslint/js` Replaces String Configs

```js
// ❌ Errors in ESLint 9 flat config, completely removed in ESLint 10
export default ["eslint:recommended"];

// ✅ Correct
import js from "@eslint/js";
export default [js.configs.recommended];
```

### 1.5 FlatCompat for Legacy Plugins

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

> **Note:** `@eslint/eslintrc` is only needed for the compat layer. If all your plugins support flat config natively, you don't need it.

### 1.6 `.eslintignore` → Config-Level Ignores

`.eslintignore` is gone. Move patterns into the config:

```js
export default [
  {
    ignores: [
      "node_modules/",
      ".next/",
      "out/",
      "build/",
      "dist/",
      "next-env.d.ts",
    ],
  },
  // ... other config objects
];
```

### 1.7 `parserOptions` → `languageOptions`

```js
// ❌ Old
{ parserOptions: { ecmaVersion: 2022, sourceType: "module" } }

// ✅ New
{ languageOptions: { ecmaVersion: 2022, sourceType: "module" } }
```

### 1.8 Removed Formatters (ESLint 9)

Built-in formatters removed: `checkstyle`, `compact`, `jslint-xml`, `junit`, `tap`, `unix`, `visualstudio`. Install replacement npm packages if you used any of these (e.g., `eslint-formatter-compact`).

### 1.9 Removed Rules (ESLint 9)

`require-jsdoc` and `valid-jsdoc` removed. Use `eslint-plugin-jsdoc` if needed.

### 1.10 `eslint:recommended` Changes (Cumulative for ESLint 9 + 10)

**Added in ESLint 9:**
- `no-constant-binary-expression`
- `no-empty-static-block`
- `no-new-native-nonconstructor`
- `no-unused-private-class-members`

**Removed from recommended in ESLint 9:**
- `no-extra-semi`
- `no-inner-declarations`
- `no-mixed-spaces-and-tabs`
- `no-new-symbol`

**Updated again in ESLint 10.** Check for new errors after upgrading.

**Action:** Run `eslint .` after migration and address any new errors from newly-enabled recommended rules. Disable rules you don't want explicitly rather than ignoring them.

### 1.11 Rule Behavior Changes (ESLint 9)

- **`no-unused-vars`**: `caughtErrors` now defaults to `"all"` — unused `catch` variables will error. Fix with `_` prefix or set `caughtErrors: "none"`.
- **`no-unused-vars`**: `varsIgnorePattern` no longer applies to `catch` arguments. Use `caughtErrorsIgnorePattern` separately.
- **`no-implicit-coercion`**: Now also catches `-(-foo)` and `foo - 0`.
- **`no-useless-computed-key`**: Flags unnecessary computed keys in classes by default.
- **`--quiet` flag**: No longer executes `"warn"` rules at all (was: ran them, hid output).
- **Multiple `/* eslint */` comments**: For the same rule in one file, now disallowed. First one wins, rest are errors.

### 1.12 ESLint 10-Specific Breaking Changes

These are additional to the ESLint 9 changes above:

- **`/* eslint-env */` comments now report as errors.** Remove all `/* eslint-env browser */` etc. from source files and use `languageOptions.globals` in config instead.
- **`no-shadow-restricted-names` reports `globalThis` by default.**
- **Config lookup starts from linted file's directory**, not CWD. In monorepos, this means ESLint looks for `eslint.config.*` walking up from each file. Usually not a problem for single-project repos.
- **Deprecated `SourceCode` methods removed**: `getTokenOrCommentBefore()`, `getTokenOrCommentAfter()`, `isSpaceBetweenTokens()`, `getJSDocComment()`. Affects custom rules/plugins only.
- **Deprecated rule context methods removed.** Affects custom rules/plugins only.
- **JSX reference tracking enabled** — better detection of unused variables in JSX. May surface new `no-unused-vars` errors in React components.
- **Built-in TypeScript types** from Espree and ESLint Scope replace `@types/espree` / `@types/eslint-scope`. Remove those `@types` packages if installed.
- **`jiti` < 2.2.0 no longer supported** for loading TypeScript config files.

### 1.13 ESLint 10 `defineConfig` (Optional but Nice)

ESLint 10 introduces `defineConfig` from `eslint/config` that brings back `extends`-like syntax in flat config:

```js
import { defineConfig } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended],
    rules: {
      // your rules
    },
  },
]);
```

This is optional — the array-of-objects format from ESLint 9 still works.

### 1.14 Complete ESLint Config Example (Next.js + TypeScript, targeting ESLint 10)

```js
// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// For Next.js — after upgrading to Next.js 16, use the new flat config exports:
// import nextPlugin from "@next/eslint-plugin-next";
// For now during the ESLint migration (before Next.js upgrade), use FlatCompat:
import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  // Global ignores
  {
    ignores: [
      "node_modules/",
      ".next/",
      "out/",
      "build/",
      "next-env.d.ts",
    ],
  },

  // Base recommended rules
  js.configs.recommended,

  // TypeScript
  ...tseslint.configs.recommended,

  // Next.js rules via compat (replace with native flat config after Next.js 16 upgrade)
  ...compat.extends("next/core-web-vitals"),

  // Project-specific overrides
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Adjust for the new caughtErrors default
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
      }],
      // Add your project rules here
    },
  },
];
```

> **After completing the Next.js 16 migration**, replace the `FlatCompat` + `compat.extends("next/core-web-vitals")` block with native imports. See Part 2, section 2.14.

---

## Part 2: Next.js 14.2 → 16.1.6

You're crossing two major versions. The 14→15 boundary has the most application code changes (async APIs, caching). The 15→16 boundary is more about tooling (Turbopack default, `next lint` removal, proxy.ts).

### 2.1 Dependency Updates

```bash
npm install next@latest react@latest react-dom@latest eslint-config-next@latest
# TypeScript projects:
npm install -D @types/react@latest @types/react-dom@latest
```

Or use the codemod CLI:

```bash
npx @next/codemod@canary upgrade latest
```

### 2.2 React 18 → 19.2 (Required)

Next.js 16 ships with React 19.2 (canary) in the App Router. Key changes:

**Must fix:**
- **`useFormState` → `useActionState`**: `useFormState` is removed. `useActionState` adds a `pending` property. Search for all `useFormState` imports and replace.
- **TypeScript:** Upgrade `@types/react` and `@types/react-dom` to latest. Many type signatures changed.

**Can take advantage of:**
- **`ref` as a prop**: Function components accept `ref` as a regular prop — `forwardRef` is no longer needed in many cases. Can clean up incrementally.
- **`<Context>` as provider**: Works directly instead of `<Context.Provider>`. Optional cleanup.
- **Cleanup functions in refs**: Ref callbacks can return cleanup functions.
- **`use()` hook**: New hook for reading promises and context in render.
- **`useEffectEvent`** (React 19.2): Extract non-reactive logic from Effects.
- **View Transitions** (React 19.2): Animate elements during navigations.
- **`<Activity>`** (React 19.2): Render background UI with `display: none` while preserving state.
- **React Compiler**: Stable in Next.js 16. Auto-memoizes components. Opt-in via `reactCompiler: true` in `next.config`.

### 2.3 Async Request APIs (CRITICAL — Introduced in 15, Mandatory in 16)

Previously synchronous APIs are now **asynchronous** and must be `await`-ed. Next.js 15 had a temporary synchronous fallback with warnings. **Next.js 16 removes the fallback entirely — synchronous access throws.**

Affected APIs:
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

**After (Next.js 15+/16):**

```tsx
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");
  return <div>{token?.value}</div>;
}
```

**Same for headers:**

```tsx
const headersList = await headers();
```

**params and searchParams are now Promises:**

```tsx
// Page
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

// Layout
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

**Next.js 16 type helpers** — run `npx next typegen` to generate global type helpers, then use:

```tsx
export default async function Page(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
  const query = await props.searchParams;
  return <h1>Blog Post: {slug}</h1>;
}
```

**Action:** Search the entire codebase for:
- `cookies()` without `await`
- `headers()` without `await`
- `draftMode()` without `await`
- `params.` access without `await params` first
- `searchParams.` access without `await searchParams` first
- Any component using these that isn't `async`
- `UnsafeUnwrappedCookies` or `UnsafeUnwrappedHeaders` — these shims no longer exist in 16

### 2.4 Caching Defaults Completely Changed (Introduced in 15)

**This is the biggest behavior change.** Next.js 14 cached aggressively by default. Next.js 15+ caches **nothing** by default. This carries forward into 16.

#### fetch() requests

```tsx
// Next.js 14: cached by default (force-cache)
const data = await fetch("https://api.example.com/data");

// Next.js 15+/16: NOT cached (no-store is default)
const data = await fetch("https://api.example.com/data");

// To opt into caching:
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

// Next.js 15+/16: NOT cached (force-dynamic)
export async function GET() {
  return Response.json({ data: "dynamic every request" });
}

// To opt into caching:
export const dynamic = "force-static";
```

#### Client Router Cache

- **Next.js 14**: Page segments cached for 30s (dynamic) / 5min (static)
- **Next.js 15+/16**: `staleTime` defaults to **0** for page segments

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

#### Impact Assessment

Search the codebase for:
- `fetch()` calls without explicit `cache` or `next.revalidate` — these now hit the network every time
- GET route handlers without `export const dynamic` — these are now dynamic
- Any performance assumptions based on automatic caching
- Special route handlers (`sitemap.ts`, `opengraph-image.tsx`, metadata files) remain static by default — no action needed for those

### 2.5 NextRequest Geolocation (Removed in 15)

`geo` and `ip` properties removed from `NextRequest`:

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

**Action:** Search for `request.geo` and `request.ip` in middleware files.

### 2.6 Config Key Renames (Stabilized in 15)

```js
// ❌ Old (Next.js 14)
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ["package-name"],
    bundlePagesRouterDependencies: true,
  },
};

// ✅ New (Next.js 15+)
module.exports = {
  serverExternalPackages: ["package-name"],
  bundlePagesRouterDependencies: true,
};
```

### 2.7 Speed Insights (Removed in 15)

Auto-instrumentation removed. Use `@vercel/speed-insights` package directly if needed.

### 2.8 `next/font` (Stabilized in 15)

`@next/font` package is removed. Use `next/font` instead. If your imports already use `next/font`, no action needed.

### 2.9 `next lint` Removed (Next.js 16)

**The `next lint` command is completely removed in Next.js 16.** `next build` also no longer runs the linter.

**Action:**
1. Replace `next lint` in all npm scripts with `eslint .` (or your preferred eslint invocation).
2. Remove the `eslint` key from `next.config.js` / `next.config.ts` — the option no longer exists.
3. If you relied on `next build` to catch lint errors, add a separate lint step in CI.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

### 2.10 Turbopack Is the Default Bundler (Next.js 16)

Turbopack is now the default for both `next dev` and `next build`. Webpack is no longer used unless you opt in.

**If you have a `webpack` config in `next.config.js`:**
- Option A: Migrate webpack config to Turbopack-compatible options. See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
- Option B: Opt out with `--webpack` flag: `next dev --webpack`, `next build --webpack`

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "dev:webpack": "next dev --webpack",
    "build:webpack": "next build --webpack"
  }
}
```

**`experimental.turbopack` config is no longer under `experimental`:**

```ts
// ❌ Old (Next.js 15)
const nextConfig: NextConfig = {
  experimental: {
    turbopack: { /* options */ },
  },
};

// ✅ New (Next.js 16)
const nextConfig: NextConfig = {
  turbopack: { /* options */ },
};
```

**Action:** Search `next.config` for any `webpack` function. If it exists, decide whether to migrate or use `--webpack` flag. Search for `experimental.turbopack` and move to top-level `turbopack`.

### 2.11 `middleware.ts` → `proxy.ts` (Next.js 16, Deprecated)

`middleware.ts` is deprecated in favor of `proxy.ts`. The edge runtime is NOT supported in proxy — it runs on Node.js.

```tsx
// ❌ Old (middleware.ts)
export function middleware(request) { /* ... */ }

// ✅ New (proxy.ts)
export function proxy(request) { /* ... */ }
// or if using default export, rename function to proxy
```

**Action:** This is a deprecation, not a removal yet. `middleware.ts` still works in 16 but will be removed in a future version. Plan to rename when convenient, but it's not urgent for this migration.

### 2.12 Removed Features (Next.js 16)

- **AMP**: All AMP APIs and configuration removed entirely. If you use AMP, it's gone.
- **`serverRuntimeConfig` and `publicRuntimeConfig`**: Removed. Use environment variables instead.

```tsx
// ❌ Old
import getConfig from "next/config";
const { publicRuntimeConfig } = getConfig();

// ✅ New
// Use process.env.NEXT_PUBLIC_* for client-side
// Use process.env.* for server-side
```

- **`experimental.ppr` flag**: Removed. Replaced by Cache Components (`cacheComponents: true` in config). If you weren't using PPR experimentally, no action needed.

**Action:** Search for `getConfig`, `serverRuntimeConfig`, `publicRuntimeConfig`, and any AMP usage.

### 2.13 TypeScript Config Support (Next.js 15+)

`next.config.ts` is now supported with full type checking:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // fully typed config
};

export default nextConfig;
```

**Action:** Optional but recommended. Rename `next.config.js` → `next.config.ts` and add types.

### 2.14 ESLint Integration After Next.js 16

Once both ESLint 10 and Next.js 16 are installed, update your ESLint config to use the native flat config exports from `@next/eslint-plugin-next` and/or `eslint-config-next`:

**Option A — Using `eslint-config-next` (simpler):**

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  // your overrides
]);
```

**Option B — Using `@next/eslint-plugin-next` directly (more control):**

```js
// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default [
  {
    ignores: [".next/", "out/", "build/", "node_modules/", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      // or for stricter: ...nextPlugin.configs["core-web-vitals"].rules,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
```

> **Do NOT also add `@next/next` in your plugins block if you're using `nextPlugin.flatConfig.coreWebVitals` in the config array.** This causes "Cannot redefine plugin" errors.

### 2.15 React Compiler (Optional, Next.js 16)

Stable in Next.js 16. Automatically memoizes components. Opt-in:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  reactCompiler: true, // No longer under experimental
};
```

### 2.16 Server Actions Security (Next.js 15+)

Next.js 15+ creates unguessable endpoints for Server Actions and prunes unused actions from the client bundle. No code changes needed, but be aware action IDs are no longer deterministic.

### 2.17 Routing Changes (Next.js 16)

Next.js 16 overhauled routing and prefetching:
- **Layout deduplication**: Shared layouts are downloaded once, not per-link.
- **Incremental prefetching**: Only fetches parts not already in cache.

No code changes needed. You may see more individual prefetch requests but lower total transfer sizes.

### 2.18 Next.js DevTools MCP (Optional, for Claude Code)

Next.js 16 offers an MCP server that can assist with upgrades:

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

Consider adding this to Claude Code's MCP config for additional context during the migration.

---

## Part 3: Security Notes

There are **critical CVEs** patched in Next.js 16.1.x affecting all 15.x and 16.x users:

- **CVE-2025-66478** (CVSS 10.0): Critical RCE vulnerability in the React Server Components protocol.
- **CVE-2025-55184** (High): Denial of Service in RSC.
- **CVE-2025-55183** (Medium): Source code exposure in RSC.

Getting to 16.1.6 patches all of these.

---

## Part 4: Migration Checklist

### Pre-Migration

- [ ] Verify Node.js ≥ 20.19.0 everywhere (local, Docker, CI)
- [ ] Commit all current changes / create a branch
- [ ] Run existing tests to establish baseline
- [ ] Audit `package.json` for incompatible peer dependencies
- [ ] Note all current npm scripts that reference `next lint`

### Phase 1: ESLint Migration (8 → 10)

- [ ] Install ESLint 10: `npm install -D eslint@latest`
- [ ] Install core packages: `npm install -D @eslint/js globals`
- [ ] Run `npx @eslint/migrate-config .eslintrc.json` to generate flat config
- [ ] Migrate `typescript-eslint`: uninstall `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`, install `typescript-eslint@latest`
- [ ] Delete all `.eslintrc.*` files
- [ ] Delete `.eslintignore` — move patterns to `ignores` in config
- [ ] Replace string plugin references with object imports
- [ ] Replace `parserOptions` with `languageOptions`
- [ ] Replace `env` with `globals` imports
- [ ] Remove any `/* eslint-env */` comments from source files (errors in ESLint 10)
- [ ] Remove `@types/espree` and `@types/eslint-scope` if installed (built-in in ESLint 10)
- [ ] Test with `npx eslint .` and fix errors
- [ ] Check for new `no-unused-vars` catch clause errors (`caughtErrors: "all"` default)
- [ ] Check for new JSX unused variable errors (ESLint 10 JSX reference tracking)
- [ ] Verify all plugins support ESLint 9+ flat config

### Phase 2: Next.js Migration (14 → 16)

- [ ] Update deps: `npm install next@latest react@latest react-dom@latest eslint-config-next@latest`
- [ ] Update types: `npm install -D @types/react@latest @types/react-dom@latest`
- [ ] Run codemod: `npx @next/codemod@canary upgrade latest`
- [ ] Run async API codemod: `npx @next/codemod@canary next-async-request-api .`
- [ ] Manually verify ALL `cookies()`, `headers()`, `draftMode()` calls are `await`-ed
- [ ] Verify ALL `params` and `searchParams` are `await`-ed in pages/layouts/routes
- [ ] Search for and remove any `UnsafeUnwrappedCookies` / `UnsafeUnwrappedHeaders` usage
- [ ] Replace `useFormState` with `useActionState` everywhere
- [ ] Audit `fetch()` calls — add `cache: "force-cache"` or `next: { revalidate: N }` where caching is needed
- [ ] Audit GET route handlers — add `export const dynamic = "force-static"` where needed
- [ ] Check for `request.geo` / `request.ip` usage in middleware
- [ ] Move `experimental.serverComponentsExternalPackages` → `serverExternalPackages`
- [ ] Move `experimental.bundlePagesRouterDependencies` → `bundlePagesRouterDependencies`
- [ ] Move `experimental.turbopack` → `turbopack` (if present)
- [ ] Remove `eslint` key from `next.config.js` / `next.config.ts`
- [ ] Replace `next lint` with `eslint .` in all npm scripts
- [ ] Remove `getConfig()` / `serverRuntimeConfig` / `publicRuntimeConfig` usage
- [ ] Remove any AMP-related code and config (if applicable)
- [ ] Check for webpack config in `next.config` — decide: migrate to Turbopack or use `--webpack` flag
- [ ] Update ESLint config to use native Next.js flat config exports (remove FlatCompat wrapper for next)
- [ ] Run `next build` and fix any build errors
- [ ] Run `next dev` and check for warnings
- [ ] Test all dynamic routes, API routes, and middleware/proxy
- [ ] Performance test — verify caching changes don't cause regressions

### Useful Commands

```bash
# Full upgrade codemod
npx @next/codemod@canary upgrade latest

# Async API codemod specifically
npx @next/codemod@canary next-async-request-api .

# Generate type helpers for async params/searchParams
npx next typegen

# ESLint config migration (starting point only)
npx @eslint/migrate-config .eslintrc.json

# Inspect your flat config visually
npx @eslint/config-inspector

# Next.js DevTools MCP (for AI-assisted migration)
npx next-devtools-mcp@latest
```
