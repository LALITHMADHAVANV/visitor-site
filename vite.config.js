import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'firebase'
            }
            if (id.includes('xlsx')) {
              return 'xlsx'
            }
            if (id.includes('@supabase')) {
              return 'supabase'
            }
            if (id.includes('react')) {
              return 'vendor-react'
            }
          }
        },
      },
    },
  },
})

