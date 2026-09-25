import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `.agents/` is vendored tooling (the security-audit skill's CommonJS
  // validators) — not app code, and not ours to reformat to this repo's rules.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '.agents/**']),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
]);

export default eslintConfig;
