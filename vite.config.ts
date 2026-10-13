import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 使用相对基础路径，保证静态部署（含子目录/微信内打开）可用。
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    /**
     * 允许的 Host 白名单。
     *
     * Vite preview 默认校验 Host 以防 DNS rebinding，因此从公网隧道
     * （cloudflared 的 *.trycloudflare.com、localtunnel 的 *.loca.lt）
     * 访问时会直接返回 403：
     *   Blocked request. This host "..." is not allowed.
     * 这里只放行这两个临时演示用的隧道域名，不放行任意 Host。
     * 本机/局域网访问（127.0.0.1、192.168.x.x）不受影响。
     */
    allowedHosts: ['.trycloudflare.com', '.loca.lt'],
  },
})
