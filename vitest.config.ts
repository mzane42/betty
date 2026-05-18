import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@parser': resolve(__dirname, 'src/parser'),
      '@db': resolve(__dirname, 'src/db'),
      '@stats': resolve(__dirname, 'src/stats'),
      '@reviewer': resolve(__dirname, 'src/reviewer'),
      '@importer': resolve(__dirname, 'src/importer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@types': resolve(__dirname, 'src/types')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false
  }
});
