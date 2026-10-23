/* SRT Check — guida e pacchetti cifrati (contenuto/guida.js caricato con la pagina, contenuto/pacchetti.js solo al primo download). */
(function (SC) {
  'use strict';

  let caricamentoPacchetti = null;

  function protezione() {
    return (self.SC_GUIDA && self.SC_GUIDA.protezione) || null;
  }

  async function guida(chiave) {
    return SC.cifratura.decifraTesto(chiave, self.SC_GUIDA.dati);
  }

  // Stessa versione (?v=) della guida, così pagina e pacchetti cambiano insieme.
  function versione() {
    const s = document.querySelector('script[src*="contenuto/guida.js"]');
    const m = s && /[?&]v=([^&]+)/.exec(s.getAttribute('src'));
    return m ? m[1] : '';
  }

  function caricaPacchetti() {
    if (self.SC_PACCHETTI) return Promise.resolve(self.SC_PACCHETTI);
    if (!caricamentoPacchetti) {
      caricamentoPacchetti = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = 'contenuto/pacchetti.js' + (versione() ? '?v=' + versione() : '');
        s.onload = () => (self.SC_PACCHETTI ? ok(self.SC_PACCHETTI) : ko(new Error('the packages file is empty')));
        s.onerror = () => { caricamentoPacchetti = null; ko(new Error('the packages could not be loaded')); };
        document.head.appendChild(s);
      });
    }
    return caricamentoPacchetti;
  }

  // sistema: 'mac' | 'windows'
  async function pacchetto(chiave, sistema) {
    const p = await caricaPacchetti();
    const bytes = await SC.cifratura.decifraBytes(chiave, p[sistema]);
    return { nome: p.nomi[sistema], blob: new Blob([bytes], { type: 'application/zip' }) };
  }

  SC.contenuto = { protezione, guida, pacchetto };
})(window.SC = window.SC || {});
