import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    server: {
      deps: {
        // Monaco ships bare .css imports that Node cannot load when the
        // package is externalised; inlining routes them through Vite instead.
        // `@monaco-editor/react` is deliberately left external — inlining it
        // breaks its default-export interop.
        inline: ['monaco-editor', 'y-monaco'],
      },
    },
  },
})
