/*
 * CALDAIA CASA SOLAROLI – service worker
 * Fa due lavori:
 *  1. tiene l'app sul telefono, così si apre anche senza campo;
 *  2. riceve le notifiche di Firebase quando l'app è chiusa.
 * 1.5: quando arriva una notifica di PROVA, avvisa lo script da solo
 *      (azione "provaArrivata"), così nel foglio si vede che è arrivata.
 * 1.6: notifiche SILENZIOSE (di notte): lo script manda solo i dati e qui
 *      vengono mostrate con silent: true, senza suono né vibrazione.
 *      Il tocco su una notifica apre la pagina indicata (es. Pulizia).
 * 1.7: cambia solo la versione (le notifiche dello sbancalamento aprono la pagina Pellet).
 * Quando si pubblica una nuova versione dell'app, aumentare VERSIONE.
 */
const VERSIONE = '1.7.0';
const API = 'https://script.google.com/macros/s/AKfycbywMuI1LosGfjYMh4PDK4dFXguCWY_T0xIGfpi47Dr7cTL_U2UDXFHEoiqp6b0_TxIvUA/exec';
const CACHE = 'caldaia-' + VERSIONE;
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const FILE_APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icona-192.png',
  './icona-512.png',
  './icona-maskable-512.png'
];

/* Conferma di arrivo delle notifiche di prova (1.5).
 * Registrato PRIMA di Firebase: riceve ogni notifica in arrivo, ad app chiusa
 * o aperta, e la lascia mostrare a Firebase come sempre. Se nei dati c'è il
 * numero di una prova, lo rimanda allo script. Non porta il codice personale:
 * il numero da solo basta allo script per scrivere "sì, alle …" nel foglio. */
self.addEventListener('push', event => {
  let d = {};
  try {
    const p = event.data ? event.data.json() : null;
    d = (p && p.data) || {};
  } catch (e) { return; }
  const lavori = [];
  // 1.6: notifica silenziosa (solo dati): la mostriamo noi, senza suono né vibrazione.
  // waitUntil tiene vivo il service worker finché la notifica non è mostrata.
  if (d.silenziosa === '1') {
    lavori.push(self.registration.showNotification(d.titolo || 'Caldaia', {
      body: d.testo || '',
      icon: 'icona-192.png',
      badge: 'icona-192.png',
      tag: 'caldaia-' + Date.now(),
      silent: true,
      data: { pagina: d.pagina || '' }
    }));
  }
  const prova = String(d.prova || '');
  if (/^[0-9a-f]{16}$/.test(prova)) {
    lavori.push(fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ azione: 'provaArrivata', prova: prova })
    }).catch(() => null));
  }
  if (lavori.length) event.waitUntil(Promise.all(lavori));
});

/* Tocco su una notifica: apre (o riporta in primo piano) l'app.
 * Registrato PRIMA di Firebase, così funziona anche quando la notifica
 * non contiene il link all'app. Se il link c'è, lascia fare a Firebase. */
self.addEventListener('notificationclick', event => {
  const dati = (event.notification && event.notification.data) || {};
  const fcm = dati.FCM_MSG;
  if (fcm && ((fcm.fcmOptions && fcm.fcmOptions.link) || (fcm.notification && fcm.notification.click_action))) return;
  event.notification.close();
  const pagina = /^[a-z]+$/.test(String(dati.pagina || '')) ? dati.pagina : '';   // 1.6
  event.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of finestre) {
      if (f.url.startsWith(self.registration.scope) && 'focus' in f) {
        if (pagina) f.postMessage({ tipo: 'apri', pagina: pagina });
        return f.focus();
      }
    }
    return self.clients.openWindow(self.registration.scope + (pagina ? '#' + pagina : ''));
  })());
});

/* Notifiche Firebase in sottofondo */
try {
  importScripts(FB + 'firebase-app-compat.js', FB + 'firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyAxMsoPdNBlwtyoKepBLlsWnRPtC5X3iwU',
    authDomain: 'caldaia-solaroli.firebaseapp.com',
    projectId: 'caldaia-solaroli',
    storageBucket: 'caldaia-solaroli.firebasestorage.app',
    messagingSenderId: '1038160638495',
    appId: '1:1038160638495:web:66ae4d1928f9dc6ec4db2a'
  });
  const messaging = firebase.messaging();
  // Lo script manda titolo e testo sia come notifica sia come dati.
  // Se c'è la parte "notifica", Firebase la mostra da solo: qui non serve rifarla.
  messaging.onBackgroundMessage(payload => {
    if (payload.notification) return;
    const d = payload.data || {};
    if (d.silenziosa === '1') return;            // 1.6: già mostrata dall'ascoltatore "push" qui sopra
    return self.registration.showNotification(d.titolo || 'Caldaia', {
      body: d.testo || '',
      icon: 'icona-192.png',
      badge: 'icona-192.png',
      tag: 'caldaia-' + Date.now(),
      data: { pagina: d.pagina || '' }
    });
  });
} catch (e) {
  // Senza rete al primo avvio Firebase non si carica: l'app funziona lo stesso,
  // le notifiche ripartono al prossimo aggiornamento del service worker.
}

/* Installazione: salva i file dell'app sul telefono */
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE_APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi.filter(n => n.startsWith('caldaia-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* Richieste di rete */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // I dati dello script Google passano sempre dalla rete (li gestisce l'app).
  if (/(^|\.)script\.google\.com$|googleusercontent\.com$|googleapis\.com$/.test(url.hostname)) return;

  // Librerie Firebase: prima la copia salvata, poi la rete.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(caches.open(CACHE).then(async c => {
      const salvata = await c.match(req);
      if (salvata) return salvata;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // File dell'app: risposta immediata dalla copia salvata (utile nel locale
  // senza campo) e aggiornamento in sottofondo per la volta successiva.
  const pagina = req.mode === 'navigate';
  event.respondWith((async () => {
    const c = await caches.open(CACHE);
    const salvata = pagina
      ? (await c.match('./index.html')) || (await c.match('./'))
      : await c.match(req, { ignoreSearch: true });
    const dallaRete = fetch(req).then(r => {
      if (r && r.ok) c.put(pagina ? './index.html' : req, r.clone());
      return r;
    }).catch(() => null);
    if (salvata) {
      event.waitUntil(dallaRete);
      return salvata;
    }
    const r = await dallaRete;
    return r || new Response('Senza connessione', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
