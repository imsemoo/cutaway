import { defineConfig } from 'vite'

// <cutaway-twin> for host pages: one classic script, dist/embed.js, beside the app it frames.
// A classic script, so the element can find the twin from its own address (document.currentScript).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    lib: { entry: 'src/embed/element.ts', formats: ['iife'], name: 'CutawayEmbed', fileName: () => 'embed.js' },
  },
})
