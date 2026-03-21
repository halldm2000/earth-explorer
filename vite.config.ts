import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import { mcpBrokerPlugin } from './src/mcp/vite-plugin-mcp-broker'
import { aisBridgePlugin } from './src/features/ships/vite-plugin-ais-bridge'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    cesium(),
    mcpBrokerPlugin(),
    aisBridgePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
