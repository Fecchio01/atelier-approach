import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'prisma/*.db', 'test-results/**', '**/*.d.ts'] },
  js.configs.recommended,
  { plugins: { '@next/next': nextPlugin }, rules: nextPlugin.configs.recommended.rules },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' }
  }
];
