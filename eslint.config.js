import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    // The classic hook rules only. The React Compiler rules assume React owns
    // every value, while a three.js scene is mutated in place by design.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['scripts/**', 'tools/**', 'e2e/**', '*.config.*'],
    languageOptions: { globals: { ...globals.node } },
  },
)
