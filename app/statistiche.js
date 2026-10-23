/* SRT Check — scheda Statistics: legge il report del test di stabilità (solo nel browser) e lo spiega. */
(function (SC) {
  'use strict';

  const GIUDIZI = {
    stable: { titolo: 'Stable', classe: 'verde' },
    unstable: { titolo: 'Unstable', classe: 'rosso' },
    'not-working': { titolo: 'Not working', classe: 'rosso' },
  };

  function avvia(contenitore) {
    const { el } = SC.check.interfaccia;

    const carica = el('label', 'carica');
    const input = el('input');
    input.type = 'file';
    input.accept = '.jsonl,.json,.txt';
    input.hidden = true;
    const nomeFile = el('span', 'carica-file', 'Drop the file here or click to choose it');
    const errore = el('span', 'carica-errore');
    errore.setAttribute('role', 'alert');
    errore.hidden = true;
    carica.append(input, el('span', 'carica-titolo', 'Stability report '), nomeFile, errore);
    carica.querySelector('.carica-titolo').appendChild(el('small', '', '(SRT-report-….jsonl)'));
    const esito = el('div');
    esito.id = 'stat-esito';
    contenitore.append(carica, esito);

    function pulisci() {
      esito.replaceChildren();
      carica.classList.remove('pronto', 'sbagliato');
      nomeFile.textContent = 'Drop the file here or click to choose it';
      errore.hidden = true;
      input.value = '';
    }

    async function apri(file) {
      if (!file) return;
      pulisci();
      nomeFile.textContent = file.name;
      let rep, analisi;
      try {
        rep = SC.report.leggi(await file.text());
        analisi = SC.report.analizza(rep);
      } catch (e) {
        carica.classList.add('sbagliato');
        errore.textContent = e.message === 'not-a-report' ? 'This file is not an SRT Check report.' : 'The report could not be read: ' + e.message;
        errore.hidden = false;
        return;
      }
      carica.classList.add('pronto');
      mostra(rep, analisi);
    }

    function numero(valore, etichetta) {
      const t = el('div', 'totale');
      t.append(el('b', '', valore), el('span', '', etichetta));
      return t;
    }

    function mostra(rep, a) {
      const m = a.misure, s = rep.intestazione.stream || {};
      const g = GIUDIZI[a.giudizio];
      const banner = el('div', 'banner ' + g.classe, g.titolo);
      esito.appendChild(banner);

      const inizio = SC.report.leggiOra(rep.intestazione.inizio);
      const dati = [
        `${s.host || '?'}:${s.porta || '?'}`, s.modalita || 'caller',
        s.latenzaMs ? `latency ${s.latenzaMs} ms` : 'default latency', s.cifrato ? 'encrypted' : 'not encrypted',
        `${Math.round(m.durataS / 60 * 10) / 10} min test` + (inizio ? ` started ${new Date(inizio).toLocaleString('en-GB')}` : ''),
        rep.intestazione.sistema === 'windows' ? 'Windows' : 'Mac',
      ];
      esito.appendChild(el('p', 'nota contesto', dati.join(' · ')));
      if (rep.fine && rep.fine.motivo === 'stopped') esito.appendChild(el('p', 'nota', 'The test was stopped before the planned time: the results cover only the part that ran.'));
      if (!rep.fine) esito.appendChild(el('p', 'nota', 'The report has no end line (the tool was closed abruptly): the results cover only what was saved.'));

      if (a.giudizio !== 'not-working') {
        const totali = el('div', 'totali');
        totali.append(
          numero(`${Math.round(m.collegatoS)} / ${Math.round(m.durataS)} s`, 'Connected'),
          numero(String(m.cadute.length), 'Interruptions'),
          numero(`${m.bitrate.medio} Mb/s`, `Bitrate (min ${m.bitrate.min}, max ${m.bitrate.max})`),
          numero(m.rtt.mediana === null ? '—' : `${m.rtt.mediana} ms`, `Round-trip time (peak ${m.rtt.p95} ms)`),
          numero(`${m.perditaPct}%`, `Network loss (${m.recuperati} packets recovered)`),
          numero(String(m.persiDefinitivi), 'Packets lost for good'),
          numero(m.latenzaUsataMs === null ? '—' : `${m.latenzaUsataMs} ms`, a.latenzaConsigliataMs ? `Latency used (recommended ≥ ${a.latenzaConsigliataMs} ms)` : 'Latency used'),
        );
        esito.appendChild(totali);
      }

      const spiegazioni = el('section', 'scheda');
      spiegazioni.appendChild(el('h2', '', 'What this means'));
      for (const f of a.frasi) {
        const box = el('div', 'frase ' + f.livello);
        box.append(el('b', '', f.titolo), el('p', '', f.testo));
        if (f.azione) { const p = el('p', 'azione'); p.append(el('span', '', 'What to do: '), f.azione); box.appendChild(p); }
        spiegazioni.appendChild(box);
      }
      esito.appendChild(spiegazioni);

      if (a.serie.length) {
        const serie = a.serie, segni = m.cadute.map((c) => c.ora);
        // il grafico si disegna alla larghezza vera del riquadro: così le scritte restano leggibili anche sul telefono
        const larghezza = Math.max(280, Math.min(1100, esito.clientWidth - 42));
        const limiti = { inizio: serie[0].ora, fine: serie[serie.length - 1].ora, larghezza, altezza: larghezza < 500 ? 170 : 190 };
        const grafico = (titolo, opzioni) => {
          const box = el('section', 'scheda');
          box.appendChild(el('h2', '', titolo));
          const div = el('div', 'contenitore-grafico');
          div.innerHTML = SC.grafici.svg({ ...limiti, segni, ...opzioni }); // SVG generato da grafici.js: testi già protetti
          box.appendChild(div);
          return box;
        };
        const latenza = serie.find((p) => p.latenzaMs) ? serie.find((p) => p.latenzaMs).latenzaMs : null;
        esito.append(
          grafico('Bitrate (Mb/s)', { serie: [{ nome: 'Bitrate', punti: serie.map((p) => [p.ora, p.mbit]), classe: 'bitrate' }], unita: 'Mb/s' }),
          grafico('Round-trip time (ms)', { serie: [{ nome: 'RTT', punti: serie.filter((p) => p.rtt !== null).map((p) => [p.ora, p.rtt]), classe: 'rtt' }], unita: 'ms' }),
          grafico('Lost packets per second (amber: recovered, red: lost for good)', {
            barre: true, unita: 'packets',
            serie: [{ nome: 'Recovered', punti: serie.map((p) => [p.ora, p.recuperati]), classe: 'recuperati' }, { nome: 'Lost for good', punti: serie.map((p) => [p.ora, p.scartati]), classe: 'scartati' }],
          }),
          grafico('Receive buffer (ms)', {
            serie: [{ nome: 'Buffer', punti: serie.filter((p) => typeof p.bufMs === 'number').map((p) => [p.ora, p.bufMs]), classe: 'buffer' }], unita: 'ms',
            linee: latenza ? [{ valore: latenza, etichetta: `Latency ${latenza} ms` }] : [],
          }),
        );
        if (segni.length) esito.appendChild(el('p', 'nota', 'Red dashed lines mark the interruptions.'));
      }

      const nuovo = el('button', 'bottone', 'Clear');
      nuovo.type = 'button';
      nuovo.addEventListener('click', pulisci);
      esito.appendChild(nuovo);
    }

    input.addEventListener('change', () => apri(input.files[0]));
    carica.addEventListener('dragover', (e) => { e.preventDefault(); carica.classList.add('sopra'); });
    carica.addEventListener('dragleave', () => carica.classList.remove('sopra'));
    carica.addEventListener('drop', (e) => {
      e.preventDefault();
      carica.classList.remove('sopra');
      apri(e.dataTransfer.files[0]);
    });
  }

  SC.statistiche = { avvia };
})(window.SC = window.SC || {});
