import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { defineConfig, type Plugin } from 'vite';

const API_PORT = 3000;

function portaEmUso(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

// Sobe a API (npm run api:dev) junto com o Vite, para o front não ficar sem backend.
function iniciarApi(): Plugin {
  let api: ChildProcess | null = null;
  return {
    name: 'florescer-api',
    apply: 'serve',
    async configureServer() {
      if (await portaEmUso(API_PORT)) {
        console.log(`[api] Já existe um serviço na porta ${API_PORT}; usando-o.`);
        return;
      }
      api = spawn('npm', ['run', 'api:dev'], { stdio: 'inherit', shell: true });
      api.on('exit', (code) => {
        if (code) console.error(`[api] A API encerrou com código ${code}. Verifique o .env e o MySQL.`);
      });
      const parar = () => { api?.kill(); api = null; };
      process.once('exit', parar);
      process.once('SIGINT', () => { parar(); process.exit(0); });
      process.once('SIGTERM', () => { parar(); process.exit(0); });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [iniciarApi()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
