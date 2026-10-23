/* SRT Check — piccolo archivio chiave/valore nel browser (IndexedDB) e download dei file. */
(function (SC) {
  'use strict';

  function db() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open('srt-check', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
  }

  async function leggi(chiave) {
    try {
      const d = await db();
      return await new Promise((ok, ko) => {
        const r = d.transaction('kv').objectStore('kv').get(chiave);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
      });
    } catch (e) { return undefined; }
  }

  async function scrivi(chiave, valore) {
    try {
      const d = await db();
      await new Promise((ok, ko) => {
        const t = d.transaction('kv', 'readwrite');
        t.objectStore('kv').put(valore, chiave);
        t.oncomplete = ok;
        t.onerror = () => ko(t.error);
      });
    } catch (e) { /* non indispensabile */ }
  }

  // Scarica un file generato nella pagina (nessun invio in rete).
  function scarica(nome, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  SC.archivio = { leggi, scrivi, scarica };
})(window.SC = window.SC || {});
