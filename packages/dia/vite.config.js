import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/mdk-editor.js',
      name: 'MdkDia',
      fileName: 'mdk-dia',
      formats: ['es'],
    },
    rollupOptions: {
      /* No external dependencies — bundle everything */
    },
  },
});
