import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import url from 'url'
import visitorsHandler from './api/visitors.js'
import usersHandler from './api/users.js'
import preregisteredHandler from './api/preregistered.js'
import hostsHandler from './api/hosts.js'
import telegramWebhookHandler from './api/telegram-webhook.js'

function apiDevServerPlugin() {
    return {
        name: 'api-dev-server',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const parsedUrl = url.parse(req.url || '', true);
                const pathname = parsedUrl.pathname;

                if (!pathname || !pathname.startsWith('/api/')) {
                    return next();
                }

                req.query = parsedUrl.query;
                
                let body = null;
                if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                    const buffers = [];
                    for await (const chunk of req) {
                        buffers.push(chunk);
                    }
                    const data = Buffer.concat(buffers).toString();
                    if (data) {
                        try {
                            body = JSON.parse(data);
                        } catch (e) {
                            body = data;
                        }
                    }
                }
                req.body = body;

                res.status = function(code) {
                    res.statusCode = code;
                    return res;
                };
                res.json = function(payload) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(payload));
                    return res;
                };

                try {
                    if (pathname === '/api/visitors') return await visitorsHandler(req, res);
                    if (pathname === '/api/users') return await usersHandler(req, res);
                    if (pathname === '/api/preregistered') return await preregisteredHandler(req, res);
                    if (pathname === '/api/hosts') return await hostsHandler(req, res);
                    if (pathname === '/api/telegram-webhook') return await telegramWebhookHandler(req, res);
                    
                    res.status(404).json({ error: 'Endpoint not found' });
                } catch (err) {
                    console.error('API middleware error:', err);
                    res.status(500).json({ error: err.message });
                }
            });
        }
    };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevServerPlugin()],
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
            if (id.includes('react')) {
              return 'vendor-react'
            }
          }
        },
      },
    },
  },
})
