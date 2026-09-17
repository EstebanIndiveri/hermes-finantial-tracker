import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["docs/audit/reproduce-findings.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);
