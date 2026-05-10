import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Downgrade to warning — too many pre-existing uses to block commits
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Test integrity Rule 2: block test-skip patterns in test files.
  // See apps/web/.claude/rules/test-integrity.md Rule 2.
  // A test that doesn't run is not a test — it is a lie. CI green that hides
  // a broken business rule is worse than CI red that catches it.
  // Override requires `// eslint-disable-next-line no-restricted-syntax` with
  // an explicit comment naming the user who approved the skip and why.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**/*.ts", "**/__tests__/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='describe'][callee.property.name='skip']",
          message: "describe.skip blocks tests from running. Per test-integrity.md Rule 2, skipping a business rule test creates false confidence — CI green can hide a broken business rule. If a test cannot run because infrastructure is missing, fix the infrastructure. Override requires explicit user-approval comment.",
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='it'][callee.property.name='skip']",
          message: "it.skip blocks the test from running. Per test-integrity.md Rule 2, skipping a business rule test creates false confidence. Override requires explicit user-approval comment.",
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='test'][callee.property.name='skip']",
          message: "test.skip blocks the test from running. Per test-integrity.md Rule 2. Override requires explicit user-approval comment.",
        },
        {
          selector: "CallExpression[callee.name='xit']",
          message: "xit (alias for it.skip) blocks tests from running. Per test-integrity.md Rule 2. Use it() to enable. Override requires explicit user-approval comment.",
        },
        {
          selector: "CallExpression[callee.name='xdescribe']",
          message: "xdescribe (alias for describe.skip) blocks tests from running. Per test-integrity.md Rule 2. Use describe() to enable. Override requires explicit user-approval comment.",
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(describe|it|test)$/][callee.property.name='runIf']",
          message: "describe.runIf / it.runIf / test.runIf conditionally skips tests based on env vars or conditions. Per test-integrity.md Rule 2, this is a silent skip — CI green can hide broken business rules. If infrastructure is missing, fail loudly. Override requires explicit user-approval comment.",
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(describe|it|test)$/][callee.property.name='skipIf']",
          message: "describe.skipIf / it.skipIf / test.skipIf conditionally skips tests. Per test-integrity.md Rule 2, this is a silent skip — fail loudly instead. Override requires explicit user-approval comment.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
