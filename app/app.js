/* SRT Check — avvio: accesso e schede. */
(function (SC) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  // scheda (data-vista) → modulo che la riempie (SC.<modulo>.avvia(contenitore, chiave))
  const MODULI = { check: 'check', build: 'build', statistics: 'statistiche', download: 'guida' };
  const app = { chiave: null, avviate: new Set() };

  // Logo mancante: via l'immagine invece di mostrarla rotta (qui e non con onerror nella pagina, che la policy blocca).
  document.querySelectorAll('.marchio-logo, .accesso-logo').forEach((img) => {
    if (img.complete && !img.naturalWidth) img.remove();
    else img.addEventListener('error', () => img.remove());
  });

  // Messaggio temporaneo in basso (tipo: '' | 'ok' | 'errore').
  function avviso(testo, tipo = '') {
    const a = document.createElement('div');
    a.className = 'avviso ' + tipo;
    a.textContent = testo;
    $('avvisi').appendChild(a);
    setTimeout(() => a.remove(), tipo === 'errore' ? 7000 : 4000);
  }

  // Ogni scheda si prepara la prima volta che si apre.
  function vai(nome) {
    if (!MODULI[nome]) return;
    document.querySelectorAll('.schede button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === nome)));
    document.querySelectorAll('.vista').forEach((v) => { v.hidden = v.id !== 'vista-' + nome; });
    const modulo = SC[MODULI[nome]];
    if (app.chiave && !app.avviate.has(nome) && modulo && modulo.avvia) { // prima dell'accesso non c'è la chiave
      app.avviate.add(nome);
      Promise.resolve(modulo.avvia($('contenitore-' + nome), app.chiave)).catch((e) => avviso('This section could not start: ' + e.message, 'errore'));
    }
  }

  async function avvia() {
    document.querySelectorAll('.schede button').forEach((b) => b.addEventListener('click', () => vai(b.dataset.vista)));
    $('btn-esci').addEventListener('click', () => SC.accesso.esci());
    app.chiave = await SC.accesso.sblocca();
    $('btn-esci').hidden = false;
    document.body.classList.add('pronto');
    vai('check');
  }

  app.avviso = avviso;
  app.vai = vai;
  SC.app = app;
  document.addEventListener('DOMContentLoaded', avvia);
})(window.SC = window.SC || {});
