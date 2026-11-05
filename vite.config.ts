/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages では https://<user>.github.io/AI-Final/ で配信する
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/AI-Final/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '配車最適化',
        short_name: '配車最適化',
        description: 'サッカーチームの送迎の配車計画を作成する',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1e6b3a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // 地図タイルや外部 API はキャッシュしない（プログラムだけをオフライン対応）
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
}));
