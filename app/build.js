/* SRT Check — scheda Build: compone la stringa da indirizzo, porta, latenza, passphrase… */
(function (SC) {
  'use strict';

  function avvia(contenitore) {
    const { el, stringaPronta, elencoMessaggi } = SC.check.interfaccia;
    const campi = {};

    function campo(nome, etichetta, input, aiuto) {
      const c = el('label', 'campo');
      c.appendChild(el('span', '', etichetta));
      c.appendChild(input);
      if (aiuto) c.appendChild(el('small', 'aiuto', aiuto));
      campi[nome] = input;
      return c;
    }
    function testo(id, segnaposto, extra) {
      const i = el('input');
      i.type = 'text';
      i.id = id;
      i.placeholder = segnaposto;
      i.autocomplete = 'off';
      i.spellcheck = false;
      Object.assign(i, extra || {});
      return i;
    }

    const box = el('section', 'scheda');
    // Modalità: due scelte
    const modo = el('fieldset', 'scelta');
    modo.appendChild(el('legend', '', 'Mode'));
    [['caller', 'Caller — this PC connects to the source'], ['listener', 'Listener — the source connects to this PC']].forEach(([valore, etichetta], i) => {
      const l = el('label', 'spunta');
      const r = el('input');
      r.type = 'radio';
      r.name = 'build-modo';
      r.value = valore;
      r.checked = i === 0;
      l.append(r, el('span', '', etichetta));
      modo.appendChild(l);
    });
    box.appendChild(modo);

    const griglia = el('div', 'griglia-campi');
    const campoHost = campo('host', 'Address', testo('build-host', '203.0.113.10 or encoder.example.com'), 'IP address or host name of the source.');
    griglia.appendChild(campoHost);
    griglia.appendChild(campo('porta', 'Port', testo('build-porta', '9000', { inputMode: 'numeric' })));
    griglia.appendChild(campo('latenzaMs', 'Latency (ms)', testo('build-latenza', '120 (default)', { inputMode: 'decimal' }), 'In milliseconds, as most encoders show it.'));
    const pass = testo('build-passphrase', 'Leave empty if the stream is not encrypted');
    pass.type = 'password';
    pass.autocomplete = 'new-password';
    const campoPass = campo('passphrase', 'Passphrase', pass, 'At least 10 characters. Any character is fine.');
    const mostraPass = el('button', 'collegamento', 'Show');
    mostraPass.type = 'button';
    mostraPass.addEventListener('click', () => {
      pass.type = pass.type === 'password' ? 'text' : 'password';
      mostraPass.textContent = pass.type === 'password' ? 'Show' : 'Hide';
    });
    campoPass.querySelector('span').append(' ', mostraPass);
    griglia.appendChild(campoPass);
    const chiave = el('select');
    chiave.id = 'build-chiave';
    [['auto', 'Auto'], ['128', 'AES-128'], ['192', 'AES-192'], ['256', 'AES-256']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; chiave.appendChild(o); });
    griglia.appendChild(campo('pbkeylen', 'Key length', chiave, 'Leave Auto unless the source asks for a specific one.'));
    griglia.appendChild(campo('streamId', 'Stream ID (optional)', testo('build-streamid', '')));
    box.appendChild(griglia);
    contenitore.appendChild(box);

    const esito = el('div');
    esito.id = 'build-esito';
    contenitore.appendChild(esito);

    function aggiorna() {
      const modalita = box.querySelector('input[name="build-modo"]:checked').value;
      campoHost.hidden = modalita === 'listener';
      const valori = { modalita };
      for (const [nome, input] of Object.entries(campi)) valori[nome] = input.value;
      if (modalita === 'listener') valori.host = '';
      esito.replaceChildren();
      const vuoto = !valori.porta.trim() && !(valori.host || '').trim();
      if (vuoto) return;
      const r = SC.stringa.componi(valori);
      if (r.errori.length) { esito.appendChild(elencoMessaggi('To complete', 'rosso', r.errori)); return; }
      const verifica = el('button', 'bottone', 'Check this string');
      verifica.type = 'button';
      verifica.addEventListener('click', () => { SC.app.vai('check'); SC.check.imposta(r.stringa); });
      esito.appendChild(stringaPronta('Your string', r.stringa, [verifica]));
      const avvisi = r.avvisi.concat(SC.stringa.analizza(r.stringa).avvisi);
      if (avvisi.length) esito.appendChild(elencoMessaggi('Warnings', 'giallo', avvisi));
    }

    box.addEventListener('input', aggiorna);
    box.addEventListener('change', aggiorna);
  }

  SC.build = { avvia };
})(window.SC = window.SC || {});
