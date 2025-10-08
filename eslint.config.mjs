import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default defineConfig([
  { ignores: ['.next/**'] },
  {
    languageOptions: { parserOptions: { projectService: true } },
  },
  eslint.configs.recommended,
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
  }),
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
]);
