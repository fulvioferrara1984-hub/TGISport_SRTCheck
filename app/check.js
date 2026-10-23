/* SRT Check — scheda Check: analizza la stringa incollata e propone quella pronta. */
(function (SC) {
  'use strict';

  let area = null, esito = null, tieni = [], attesa = null, daImpostare = null;

  // Crea un elemento; i testi vanno sempre come testo (mai come HTML): la stringa incollata non può iniettare nulla.
  function el(tag, classe, testo) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo !== undefined) e.textContent = testo;
    return e;
  }

  // I messaggi scrivono i nomi dei parametri tra `…`: diventano <code>.
  function conCodice(contenitore, testo) {
    testo.split('`').forEach((pezzo, i) => {
      if (pezzo) contenitore.appendChild(i % 2 ? el('code', '', pezzo) : document.createTextNode(pezzo));
    });
    return contenitore;
  }

  function copia(testo, origine) {
    const fatto = () => SC.app.avviso('Copied.', 'ok');
    const ripiego = () => {
      const r = document.createRange();
      r.selectNodeContents(origine);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      try { document.execCommand('copy'); fatto(); } catch (e) { SC.app.avviso('Press Cmd+C (Mac) or Ctrl+C (Windows) to copy.'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(testo).then(fatto, ripiego);
    else ripiego();
  }

  // Riquadro con la stringa e i bottoni (usato anche da Build).
  function stringaPronta(titolo, testo, bottoniExtra) {
    const box = el('section', 'scheda');
    box.appendChild(el('h2', '', titolo));
    const codice = el('code', 'stringa-pronta', testo);
    box.appendChild(codice);
    const bottoni = el('div', 'bottoni');
    const b = el('button', 'primario', 'Copy');
    b.type = 'button';
    b.addEventListener('click', () => copia(testo, codice));
    bottoni.appendChild(b);
    (bottoniExtra || []).forEach((x) => bottoni.appendChild(x));
    box.appendChild(bottoni);
    return box;
  }

  function elencoMessaggi(titolo, classe, messaggi, extra) {
    const box = el('section', 'scheda messaggi ' + classe);
    box.appendChild(el('h2', '', titolo));
    const ul = el('ul', 'elenco-messaggi');
    messaggi.forEach((m) => {
      const li = conCodice(el('li'), m.testo);
      if (extra) extra(m, li);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  function frasemodalita(r) {
    if (r.modalita === 'listener') return `This PC will wait for the source on port ${r.porta} (UDP): the source must call this PC, and port ${r.porta} must be open on firewall and router.`;
    if (r.modalita === 'rendezvous') return `Both sides call each other on port ${r.porta} (rendezvous mode).`;
    return `This PC will connect to ${r.host.includes(':') ? '[' + r.host + ']' : r.host}:${r.porta}.`;
  }

  function riepilogo(r) {
    const box = el('section', 'scheda riepilogo');
    box.appendChild(el('h2', '', 'Summary'));
    box.appendChild(el('p', 'frase-modalita', frasemodalita(r)));
    const dl = el('dl');
    const riga = (nome, valore) => { dl.appendChild(el('dt', '', nome)); const dd = el('dd'); if (typeof valore === 'string') dd.textContent = valore; else dd.appendChild(valore); dl.appendChild(dd); };
    riga('Mode', r.modalita);
    riga('Address', r.host || '—');
    riga('Port', r.porta === null ? '—' : String(r.porta));
    riga('Latency', r.latenzaMs === null ? '120 ms (default)' : `${r.latenzaMs} ms`);
    riga('Encryption', !r.cifrato ? 'None' : ({ 16: 'AES-128', 24: 'AES-192', 32: 'AES-256' }[r.pbkeylen] || 'Yes (default key length)'));
    if (r.cifrato) {
      const dd = el('span', 'segreto');
      const valore = el('code', '', '•'.repeat(Math.min(r.passphrase.length, 24)));
      const mostra = el('button', 'collegamento', 'Show');
      mostra.type = 'button';
      mostra.addEventListener('click', () => {
        const visibile = mostra.textContent === 'Hide';
        valore.textContent = visibile ? '•'.repeat(Math.min(r.passphrase.length, 24)) : r.passphrase;
        mostra.textContent = visibile ? 'Show' : 'Hide';
      });
      dd.append(valore, ` (${r.passphrase.length} characters) `, mostra);
      riga('Passphrase', dd);
    }
    if (r.streamId) riga('Stream ID', el('code', '', r.streamId));
    const altri = r.parametri.filter((p) => !['mode', 'latency', 'passphrase', 'pbkeylen', 'streamid', 'srt_streamid'].includes(p.nome));
    if (altri.length) riga('Other parameters', el('code', '', altri.map((p) => `${p.nome}=${p.valore}`).join('  ')));
    box.appendChild(dl);
    return box;
  }

  function mostra() {
    esito.replaceChildren();
    if (!area.value.trim()) return;
    const r = SC.stringa.analizza(area.value, { tieniOriginali: tieni });
    const banner = el('div', 'banner');
    if (r.errori.length) { banner.classList.add('rosso'); banner.textContent = 'This string cannot work.'; }
    else if (r.avvisi.length) { banner.classList.add('giallo'); banner.textContent = 'This string connects, but check the warnings below.'; }
    else { banner.classList.add('verde'); banner.textContent = 'This string looks right.'; }
    esito.appendChild(banner);

    if (r.errori.length) esito.appendChild(elencoMessaggi('Errors', 'rosso', r.errori));
    if (r.avvisi.length || tieni.length) {
      const box = elencoMessaggi('Warnings', 'giallo', r.avvisi, (m, li) => {
        if (!m.annullabile) return;
        const b = el('button', 'collegamento', 'Keep the original value');
        b.type = 'button';
        b.addEventListener('click', () => { tieni.push(m.codice); mostra(); });
        li.append(' ', b);
      });
      tieni.forEach((codice) => {
        const li = el('li', 'tenuto', codice === 'latenza-ms' ? 'Keeping the latency exactly as written. ' : 'Keeping the original value, exactly as written. ');
        const b = el('button', 'collegamento', 'Use the suggestion');
        b.type = 'button';
        b.addEventListener('click', () => { tieni = tieni.filter((c) => c !== codice); mostra(); });
        li.appendChild(b);
        box.querySelector('ul').appendChild(li);
      });
      esito.appendChild(box);
    }
    if (r.riepilogo) esito.appendChild(riepilogo(r.riepilogo));
    if (r.note.length) esito.appendChild(elencoMessaggi('Automatic corrections', 'grigio', r.note));
    if (r.pronta) {
      esito.appendChild(stringaPronta('Ready string', r.pronta));
      esito.lastChild.appendChild(el('p', 'nota', 'Paste this string into the SRT Check tool on your computer (see Download & guide).'));
    }
  }

  function imposta(testo) {
    if (!area) { daImpostare = testo; return; }
    area.value = testo;
    tieni = [];
    mostra();
  }

  function avvia(contenitore) {
    const box = el('section', 'scheda');
    const etichetta = el('label', 'campo');
    etichetta.appendChild(el('span', '', 'SRT string'));
    area = el('textarea', 'mono');
    area.id = 'check-testo';
    area.rows = 3;
    area.spellcheck = false;
    area.autocomplete = 'off';
    area.placeholder = 'srt://203.0.113.10:9000?latency=500000&passphrase=…';
    etichetta.appendChild(area);
    box.appendChild(etichetta);
    contenitore.append(box);
    esito = el('div');
    esito.id = 'check-esito';
    contenitore.appendChild(esito);
    area.addEventListener('input', () => {
      tieni = [];
      clearTimeout(attesa);
      attesa = setTimeout(mostra, 150);
    });
    if (daImpostare !== null) { imposta(daImpostare); daImpostare = null; }
  }

  SC.check = { avvia, imposta, interfaccia: { el, conCodice, copia, stringaPronta, elencoMessaggi } };
})(window.SC = window.SC || {});
