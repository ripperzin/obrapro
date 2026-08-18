import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Carimbo da build (dia/hora de São Paulo), mostrado no cabeçalho do app.
// Serve pra responder na hora "você está na versão nova?" — durante o teste na
// obra a gente perdeu rodadas discutindo se era bug ou app desatualizado.
const carimboDaBuild = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date()).replace(',', '');

export default defineConfig(() => {
  return {
    define: {
      __BUILD_ID__: JSON.stringify(carimboDaBuild),
    },
    server: {
      port: 3000,
      host: true, // Listen on all addresses
    },
    plugins: [
      // basicSsl(),
      react(),
      VitePWA({
        // 'prompt' (não 'autoUpdate'): a nova versão NÃO recarrega a página sozinha.
        // O usuário vê o aviso "Atualizar Agora" (ReloadPrompt) e escolhe a hora —
        // assim não perde o que está digitando quando publicamos uma atualização.
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'Obra Pro - Gestão de Obras',
          short_name: 'Obra Pro',
          description: 'Sistema de gestão de obras e empreendimentos imobiliários',
          theme_color: '#1e293b',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            // Removed supabase.co caching to prevent conflict with React Query persistence
            {
              urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tailwind-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/esm\.sh\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'esm-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false // Disable PWA in dev mode to prevent refresh issues
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
