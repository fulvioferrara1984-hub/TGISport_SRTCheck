/* SRT Check — scheda Download & guide: scarica lo strumento cifrato e mostra la guida. */
(function (SC) {
  'use strict';

  function sistemaInUso() {
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
    if (/mac/i.test(p)) return 'mac';
    if (/win/i.test(p)) return 'windows';
    return null;
  }

  async function avvia(contenitore, chiave) {
    const { el } = SC.check.interfaccia;
    const box = el('section', 'scheda scarica');
    box.appendChild(el('h2', '', 'Download the tool'));
    const bottoni = el('div', 'bottoni');
    const inUso = sistemaInUso();
    const etichette = { mac: 'Download for Mac', windows: 'Download for Windows' };
    for (const sistema of ['mac', 'windows']) {
      const b = el('button', sistema === inUso || (!inUso && sistema === 'mac') ? 'primario' : 'bottone', etichette[sistema]);
      b.type = 'button';
      b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = 'Preparing the download…';
        try {
          const { nome, blob } = await SC.contenuto.pacchetto(chiave, sistema);
          SC.archivio.scarica(nome, blob);
        } catch (e) {
          SC.app.avviso('The download could not be prepared: ' + e.message, 'errore');
        } finally {
          b.disabled = false;
          b.textContent = etichette[sistema];
        }
      });
      bottoni.appendChild(b);
    }
    box.appendChild(bottoni);
    box.appendChild(el('p', 'nota', inUso ? `This computer looks like a ${inUso === 'mac' ? 'Mac' : 'Windows PC'}: its version is highlighted.` : 'Choose the version for your computer.'));
    contenitore.appendChild(box);

    const guida = el('div', 'guida-testo');
    contenitore.appendChild(guida);
    try {
      guida.innerHTML = await SC.contenuto.guida(chiave); // guida del team, decifrata con la sua chiave
    } catch (e) {
      guida.appendChild(el('p', 'errore', 'The guide could not be opened: ' + e.message));
    }
  }

  SC.guida = { avvia };
})(window.SC = window.SC || {});
