import { initRouter } from './router.js';
import { clearSession } from './auth.js';

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    const checkUpdates = () => reg.update();
    checkUpdates();
    setInterval(checkUpdates, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkUpdates();
    });
  } catch (err) {
    console.warn('Service Worker no registrado:', err);
  }
}

function boot() {
  clearSession();
  window.location.hash = '#/login';
  initRouter();
}

registerServiceWorker().finally(boot);
