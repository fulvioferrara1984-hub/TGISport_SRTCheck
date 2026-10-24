/* SRT Check — lettura e analisi dei report del test di stabilità (statistiche di srt-live-transmit -f -pf:json). */
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (radice.SC = radice.SC || {})[m.NOME] = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // SRT Deployment Guide 1.5.3, "RTT Multiplier" (Haivision): perdita massima %, moltiplicatore dell'RTT, latenza minima (ms).
  const TABELLA_HAIVISION = [
    { perdita: 1, moltiplicatore: 3, minima: 60 },
    { perdita: 3, moltiplicatore: 4, minima: 80 },
    { perdita: 7, moltiplicatore: 6, minima: 120 },
    { perdita: 10, moltiplicatore: 8, minima: 160 },
    { perdita: 12, moltiplicatore: 8, minima: 160 },
    { perdita: 21, moltiplicatore: 10, minima: 200 },
    { perdita: 25, moltiplicatore: 13, minima: 260 },
    { perdita: 27, moltiplicatore: 14, minima: 280 },
    { perdita: 30, moltiplicatore: 14, minima: 280 },
    { perdita: 40, moltiplicatore: 30, minima: 600 },
  ];
  const ATTESA_INIZIALE_MS = 2000; // primi secondi di ogni connessione esclusi dal bitrate
  const FERMA_MINIMA_MS = 2000;
  const STESSO_EVENTO_MS = 2000;
  const BITRATE_BASSO_MBIT = 1; // sotto questo bitrate (media degli ultimi 10 s) un buco può essere un'immagine fissa in VBR
  const FINESTRA_BITRATE_MS = 10000;
  const CONTATORI = { unici: 'packetsUnique', persi: 'packetsLost', scartati: 'packetsDropped', ritrasmessi: 'packetsRetransmitted', tardivi: 'packetsBelated' };

  // Ora ISO con frazione di qualsiasi lunghezza e fuso +HHMM, +HH:MM o Z → millisecondi; null se non è un'ora.
  function leggiOra(testo) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}:?\d{2})?$/.exec(String(testo || '').trim());
    if (!m) return null;
    const ms = m[7] ? Math.floor(Number('0.' + m[7]) * 1000) : 0;
    let base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
    if (!m[8]) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms).getTime();
    if (m[8] !== 'Z') {
      const f = m[8].replace(':', '');
      base -= (f[0] === '-' ? -1 : 1) * (Number(f.slice(1, 3)) * 60 + Number(f.slice(3, 5))) * 60000;
    }
    return base;
  }

  function due(n) { return String(n).padStart(2, '0'); }
  function ora(ms) { const d = new Date(ms); return `${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`; }

  function leggi(testo) {
    let intestazione = null, fine = null, illeggibili = 0;
    const eventi = [], perSid = new Map();
    for (const riga of String(testo).split(/\r?\n/)) {
      if (!riga.trim()) continue;
      let o;
      try { o = JSON.parse(riga); } catch (e) { illeggibili++; continue; }
      if (!o || typeof o !== 'object') { illeggibili++; continue; }
      if (o.formato === 'srt-check-report') intestazione = o;
      else if (o.evento) eventi.push({ evento: o.evento, ora: leggiOra(o.ora), dettaglio: o.dettaglio || '' });
      else if (o.fine) fine = { ora: leggiOra(o.fine), motivo: o.motivo || '' };
      else if (o.sid !== undefined && o.recv) {
        if (!perSid.has(o.sid)) perSid.set(o.sid, []);
        perSid.get(o.sid).push(o);
      }
    }
    if (!intestazione) throw new Error('not-a-report');
    const connessioni = [];
    for (const [sid, righe] of perSid) {
      righe.sort((a, b) => a.time - b.time);
      const precedente = { unici: 0, persi: 0, scartati: 0, ritrasmessi: 0, tardivi: 0, byte: 0, t: 0 };
      const campioni = [];
      for (const r of righe) {
        const c = { ora: leggiOra(r.timepoint), t: r.time, rtt: r.link ? r.link.rtt : null, banda: r.link ? r.link.bandwidth : null, bufMs: r.recv.msBuf, latenzaMs: r.recv.msTsbPdDelay };
        if (c.ora === null) continue;
        // con -f anche mbitRate è una media dall'inizio della connessione: il bitrate dell'intervallo si ricava dai byte
        const byte = Number(r.recv.bytesUnique !== undefined ? r.recv.bytesUnique : r.recv.bytes) || 0;
        const passo = r.time - precedente.t;
        c.mbit = passo > 0 ? Math.max(0, byte - precedente.byte) * 8 / (passo * 1000) : Number(r.recv.mbitRate) || 0;
        precedente.byte = Math.max(precedente.byte, byte);
        precedente.t = r.time;
        for (const [nome, campo] of Object.entries(CONTATORI)) {
          const totale = Number(r.recv[campo]) || 0;
          c[nome] = Math.max(0, totale - precedente[nome]);
          precedente[nome] = Math.max(precedente[nome], totale);
        }
        campioni.push(c);
      }
      if (campioni.length) connessioni.push({ sid, campioni });
    }
    connessioni.sort((a, b) => a.campioni[0].ora - b.campioni[0].ora);
    eventi.sort((a, b) => (a.ora || 0) - (b.ora || 0));
    const avvertenze = [];
    if (!fine) avvertenze.push('incomplete');
    if (illeggibili) avvertenze.push('unreadable-lines');
    return { intestazione, eventi, connessioni, fine, avvertenze };
  }

  function latenzaConsigliata(perditaPct, rttRiferimentoMs) {
    const fascia = TABELLA_HAIVISION.find((f) => perditaPct <= f.perdita);
    if (!fascia) return null;
    const valore = Math.max(fascia.moltiplicatore * Math.max(rttRiferimentoMs, 20), fascia.minima);
    return Math.ceil(Math.round(valore * 1000) / 10000) * 10;
  }

  function mediana(v) {
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  }
  function percentile(v, p) {
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)];
  }
  const somma = (v) => v.reduce((a, b) => a + b, 0);
  const tondo = (n, cifre = 1) => Math.round(n * 10 ** cifre) / 10 ** cifre;

  function elencoOrari(lista) {
    const orari = lista.slice(0, 5).map((x) => ora(x.ora) + (x.durataS ? ` (${tondo(x.durataS)} s)` : ''));
    return orari.join(', ') + (lista.length > 5 ? ` and ${lista.length - 5} more` : '');
  }

  // Interruzioni e soste: cambio di sid, eventi "disconnected", buchi senza righe di statistiche.
  function cadutePause(rep, intervalloMs) {
    const soglia = Math.max(3000, 3 * intervalloMs);
    const cadute = [], ferme = [], pause = [];
    // bitrate medio prima del buco: con pochi Mb/s un buco senza perdite può essere un'immagine fissa in VBR
    const bitratePrima = (v, i) => {
      const finestra = v.slice(0, i + 1).filter((c) => c.ora >= v[i].ora - FINESTRA_BITRATE_MS);
      return somma(finestra.map((c) => c.mbit)) / finestra.length;
    };
    const sosta = (v, i, buco) => (bitratePrima(v, i) < BITRATE_BASSO_MBIT ? pause : ferme).push(buco);
    const { connessioni, eventi } = rep;
    for (let i = 1; i < connessioni.length; i++) {
      const a = connessioni[i - 1].campioni, b = connessioni[i].campioni;
      const inizio = a[a.length - 1].ora, fine = b[0].ora - b[0].t;
      cadute.push({ ora: inizio, fine: Math.max(fine, inizio) });
    }
    for (const c of connessioni) {
      const v = c.campioni;
      for (let i = 1; i < v.length; i++) {
        if (v[i].ora - v[i - 1].ora <= soglia) continue;
        const buco = { ora: v[i - 1].ora, fine: v[i].ora - intervalloMs };
        if (v[i].persi > 0 || v[i].scartati > 0) cadute.push(buco); // dopo il buco mancano pacchetti: si è interrotta la rete
        else sosta(v, i - 1, buco); // collegamento attivo, nessun dato e nessun pacchetto perso: la sorgente non inviava
      }
      // righe con zero pacchetti (a collegamento attivo, dopo i primi secondi)
      let da = null;
      for (let i = 0; i <= v.length; i++) {
        const zero = i < v.length && v[i].t >= ATTESA_INIZIALE_MS && v[i].unici === 0;
        if (zero && da === null) da = i;
        if (!zero && da !== null) {
          const inizio = v[da].ora - intervalloMs, fine = v[i - 1].ora;
          if (fine - inizio >= FERMA_MINIMA_MS) ferme.push({ ora: inizio, fine });
          da = null;
        }
      }
    }
    const ultima = connessioni.length ? connessioni[connessioni.length - 1].campioni : [];
    const fineTest = rep.fine && rep.fine.ora !== null ? rep.fine.ora : (ultima.length ? ultima[ultima.length - 1].ora : null);
    // righe che finiscono molto prima della fine del test, senza caduta: la sorgente ha smesso di inviare.
    // Margine di 5 s: alla fine normale passano 2-3 s fra l'ultima riga e la riga "fine".
    if (ultima.length && fineTest !== null) {
      const ultimaOra = ultima[ultima.length - 1].ora;
      const caduta = eventi.some((e) => e.evento === 'disconnected' && e.ora !== null && e.ora >= ultimaOra - STESSO_EVENTO_MS && e.ora <= fineTest);
      if (!caduta && fineTest - ultimaOra > soglia + 5000) sosta(ultima, ultima.length - 1, { ora: ultimaOra, fine: fineTest, coda: true });
    }
    for (const e of eventi) {
      if (e.evento !== 'disconnected' || e.ora === null) continue;
      const coperto = cadute.some((c) => e.ora >= c.ora - STESSO_EVENTO_MS && e.ora <= c.fine + STESSO_EVENTO_MS);
      if (coperto) continue;
      const dopo = eventi.find((x) => x.evento === 'connected' && x.ora !== null && x.ora > e.ora);
      const campioneDopo = connessioni.flatMap((c) => c.campioni).find((x) => x.ora > e.ora);
      const fine = dopo ? dopo.ora : campioneDopo ? campioneDopo.ora : fineTest;
      if (fine === null || fine - e.ora < 3000) continue; // la sorgente chiude alla fine del test: non è una caduta
      cadute.push({ ora: e.ora, fine });
    }
    const forma = (x) => ({ ora: x.ora, durataS: tondo(Math.max(0, x.fine - x.ora) / 1000) });
    cadute.sort((a, b) => a.ora - b.ora);
    ferme.sort((a, b) => a.ora - b.ora);
    pause.sort((a, b) => a.ora - b.ora);
    return { cadute: cadute.map(forma), ferme: ferme.map(forma), pause: pause.map(forma), intervalliCadute: cadute, intervalliFerme: ferme.concat(pause), fineTest };
  }

  // Aritmetica degli intervalli {ora, fine} in millisecondi.
  function unisci(lista) {
    const v = lista.filter((x) => x.fine > x.ora).map((x) => ({ ora: x.ora, fine: x.fine })).sort((a, b) => a.ora - b.ora);
    const fuori = [];
    for (const x of v) {
      const ultimo = fuori[fuori.length - 1];
      if (ultimo && x.ora <= ultimo.fine) ultimo.fine = Math.max(ultimo.fine, x.fine);
      else fuori.push(x);
    }
    return fuori;
  }
  function sottrai(intervalli, buchi) {
    let resto = intervalli;
    for (const b of buchi) {
      resto = resto.flatMap((x) => {
        if (b.fine <= x.ora || b.ora >= x.fine) return [x];
        return [{ ora: x.ora, fine: b.ora }, { ora: b.fine, fine: x.fine }].filter((y) => y.fine > y.ora);
      });
    }
    return resto;
  }
  const lunghezza = (lista) => somma(lista.map((x) => x.fine - x.ora));

  function frase(codice, livello, titolo, testo, azione) {
    return { codice, livello, titolo, testo, azione };
  }

  function analizza(rep) {
    const tutti = rep.connessioni.flatMap((c) => c.campioni).sort((a, b) => a.ora - b.ora);
    const intervalli = rep.connessioni.flatMap((c) => c.campioni.slice(1).map((x, i) => x.ora - c.campioni[i].ora));
    const intervalloMs = mediana(intervalli) || 1000;
    const inizioTest = Math.min(...[leggiOra(rep.intestazione.inizio), tutti.length ? tutti[0].ora - tutti[0].t : null].filter((x) => x !== null));
    const fineTest = rep.fine && rep.fine.ora !== null ? rep.fine.ora : (tutti.length ? tutti[tutti.length - 1].ora : inizioTest);
    const { cadute, ferme, pause, intervalliCadute, intervalliFerme } = cadutePause(rep, intervalloMs);

    const s = (nome) => somma(tutti.map((c) => c[nome]));
    const unici = s('unici'), persi = s('persi'), scartati = s('scartati'), ritrasmessi = s('ritrasmessi');
    const rtt = tutti.map((c) => c.rtt).filter((x) => typeof x === 'number');
    const pieni = tutti.filter((c) => c.t >= ATTESA_INIZIALE_MS);
    const bitrate = (pieni.length ? pieni : tutti).map((c) => c.mbit);
    const latenze = tutti.map((c) => c.latenzaMs).filter((x) => typeof x === 'number');
    const latenzaUsataMs = latenze.length ? mediana(latenze) : (rep.intestazione.stream && rep.intestazione.stream.latenzaMs) || null;
    // tempo collegato: unione degli intervalli delle connessioni (più una sosta in coda, a collegamento attivo) meno le cadute
    const collegati = rep.connessioni.map((c) => ({ ora: c.campioni[0].ora - c.campioni[0].t, fine: c.campioni[c.campioni.length - 1].ora }))
      .concat(intervalliFerme.filter((f) => f.coda));
    const collegatoMs = lunghezza(sottrai(unisci(collegati), intervalliCadute));
    const perditaPct = unici ? persi / unici * 100 : 0;
    const misure = {
      durataS: tondo((fineTest - inizioTest) / 1000),
      collegatoS: tondo(collegatoMs / 1000),
      cadute,
      bitrate: bitrate.length ? { medio: tondo(somma(bitrate) / bitrate.length, 2), min: tondo(Math.min(...bitrate), 2), max: tondo(Math.max(...bitrate), 2) } : { medio: 0, min: 0, max: 0 },
      rtt: rtt.length ? { medio: tondo(somma(rtt) / rtt.length), mediana: tondo(mediana(rtt)), p95: tondo(percentile(rtt, 95)), max: tondo(Math.max(...rtt)) } : { medio: null, mediana: null, p95: null, max: null },
      perditaPct: tondo(perditaPct, 2),
      recuperati: Math.max(0, persi - scartati),
      persiDefinitivi: scartati,
      ritrasmissioniPct: tondo(unici ? ritrasmessi / unici * 100 : 0, 2),
      latenzaUsataMs,
      sorgenteFerma: ferme,
      pauseDati: pause,
    };
    const latenzaConsigliataMs = rtt.length ? latenzaConsigliata(perditaPct, misure.rtt.p95) : null;
    const serie = perSecondo(tutti);

    const frasi = [];
    const listener = rep.intestazione.stream && rep.intestazione.stream.modalita === 'listener';
    const erroreRegistrato = rep.eventi.filter((e) => e.evento === 'error' && e.dettaglio).pop();
    const conMessaggio = (testo) => testo + (erroreRegistrato ? ` The tool recorded this message: “${erroreRegistrato.dettaglio}” (see the troubleshooting table of the guide).` : '');
    const consiglioCollegamento = listener
      ? 'Check that the source calls this PC’s address and port, that the firewall allowed SRT Check and that the port is open (UDP) on the router.'
      : 'Check the address and port, and that the other side is in listener mode and reachable from this network.';
    if (!tutti.length) {
      frasi.push(frase('non-funziona-mai-collegato', 'error', 'Never connected',
        conMessaggio('The tool never managed to connect to the stream, so there is nothing to measure.'),
        consiglioCollegamento + ' The Check tab helps with the string itself.'));
      return { giudizio: 'not-working', misure, latenzaConsigliataMs, frasi, serie };
    }
    if (!unici) {
      frasi.push(frase('non-funziona-senza-dati', 'error', 'Connected, but no video',
        conMessaggio('The connection worked, but no video data arrived during the whole test.'),
        'The source is connected but not sending: check that the encoder is actually streaming to this destination.'));
      return { giudizio: 'not-working', misure, latenzaConsigliataMs, frasi, serie };
    }

    const consiglio = latenzaUsataMs !== null && latenzaConsigliataMs !== null && latenzaUsataMs < latenzaConsigliataMs;
    let consiglioDato = false;
    if (scartati > 0) {
      const momenti = [];
      for (const c of tutti.filter((x) => x.scartati > 0)) {
        if (!momenti.length || c.ora - momenti[momenti.length - 1].ora > STESSO_EVENTO_MS) momenti.push({ ora: c.ora });
      }
      frasi.push(frase('persi-definitivi', 'error', 'Packets lost for good',
        `${scartati} packets arrived too late and were lost for good: the picture may have frozen or broken up at ${elencoOrari(momenti)}.`,
        consiglio ? `The latency in use (${latenzaUsataMs} ms) is too low for this network: raise it to at least ${latenzaConsigliataMs} ms on both sides.`
          : latenzaConsigliataMs === null && rtt.length ? 'No latency can make up for this much loss: see “Link unusable for live video”.'
            : 'The latency already matches the measured network: check the network path (Wi-Fi, VPN, busy links) between the source and this PC.'));
      consiglioDato = consiglio;
    } else if (persi > 0) {
      frasi.push(frase('perdita-recuperata', 'info', 'Losses recovered',
        `The network lost ${tondo(perditaPct, 2)}% of the packets, but SRT resent all of them in time: the picture was not affected.`,
        consiglio ? `To have some margin, raise the latency to at least ${latenzaConsigliataMs} ms.` : 'Nothing to do for now.'));
      consiglioDato = consiglio;
    }
    if (perditaPct > 40) {
      frasi.push(frase('rete-inutilizzabile', 'error', 'Link unusable for live video',
        `${tondo(perditaPct, 1)}% of the packets were lost: even the most generous SRT settings (30 × the round-trip time, at least 600 ms) cannot recover this much.`,
        'Use another network or connection (wired rather than Wi-Fi or mobile) and test again.'));
    }
    if (perditaPct > 10) {
      frasi.push(frase('perdita-alta', 'warning', 'Very unstable network',
        `${tondo(perditaPct, 1)}% of the packets were lost on the way. SRT used about ${tondo(misure.ritrasmissioniPct, 0)}% more bandwidth to resend them.`,
        'Prefer a wired connection and avoid busy or shared links; the bitrate plus the extra bandwidth must fit comfortably in the link.'));
    }
    if (cadute.length) {
      frasi.push(frase('cadute', 'error', cadute.length === 1 ? 'The stream stopped once' : `The stream stopped ${cadute.length} times`,
        `The stream was interrupted at ${elencoOrari(cadute)}.`,
        'If it happens often, check the network, the firewall and the source.'));
    }
    if (ferme.length) {
      frasi.push(frase('sorgente-ferma', 'error', 'The source stopped sending',
        `No video arrived at ${elencoOrari(ferme)} while the connection stayed up and no packets were lost: the source stopped sending, not the network.`,
        'Check the encoder or the source equipment at those times.'));
    }
    if (pause.length) {
      frasi.push(frase('pausa-dati', 'warning', 'No data for a while',
        `No data arrived at ${elencoOrari(pause)}: the source stopped sending, or it sent a still image at a very low variable bitrate.`,
        'If the picture was moving at those times, check the source.'));
    }
    if (misure.rtt.p95 > 2 * misure.rtt.mediana && misure.rtt.p95 - misure.rtt.mediana >= 10) {
      frasi.push(frase('rtt-irregolare', 'warning', 'Irregular network path',
        `The round-trip time changes a lot (usually ${misure.rtt.mediana} ms, peaks of ${misure.rtt.p95} ms): the network path is irregular.`,
        latenzaConsigliataMs ? `Keep the latency at ${latenzaConsigliataMs} ms or more.` : 'Keep a generous latency.'));
    }
    if (consiglio && !consiglioDato) {
      frasi.push(frase('latenza-sotto-consigliata', 'warning', 'Latency below the recommended value',
        `With a round-trip time of ${misure.rtt.p95} ms and ${tondo(perditaPct, 2)}% loss, the recommended latency is ${latenzaConsigliataMs} ms; this test used ${latenzaUsataMs} ms.`,
        `Raise the latency to at least ${latenzaConsigliataMs} ms on both sides for some safety margin.`));
    }
    const giudizio = scartati > 0 || cadute.length || ferme.length ? 'unstable' : 'stable';
    if (giudizio === 'stable' && !frasi.some((f) => f.livello === 'warning' || f.livello === 'error' || f.livello === 'info')) {
      frasi.push(frase('tutto-pulito', 'ok', 'Stable stream',
        `The stream was stable for the whole test with the current latency (${latenzaUsataMs} ms).`, 'Nothing to do.'));
    }
    return { giudizio, misure, latenzaConsigliataMs, frasi, serie };
  }

  // Un punto al secondo per i grafici.
  function perSecondo(campioni) {
    const punti = new Map();
    for (const c of campioni) {
      const s = Math.floor(c.ora / 1000) * 1000;
      const p = punti.get(s) || { ora: s, mbit: [], rtt: [], persi: 0, recuperati: 0, scartati: 0, bufMs: null, latenzaMs: null, collegato: true };
      p.mbit.push(c.mbit);
      if (typeof c.rtt === 'number') p.rtt.push(c.rtt);
      p.persi += c.persi;
      p.scartati += c.scartati;
      p.recuperati += Math.max(0, c.persi - c.scartati);
      p.bufMs = c.bufMs;
      p.latenzaMs = c.latenzaMs;
      punti.set(s, p);
    }
    return [...punti.values()].sort((a, b) => a.ora - b.ora).map((p) => ({
      ...p, mbit: tondo(somma(p.mbit) / p.mbit.length, 2), rtt: p.rtt.length ? tondo(somma(p.rtt) / p.rtt.length) : null,
    }));
  }

  return { NOME: 'report', TABELLA_HAIVISION, leggi, leggiOra, ora, analizza, latenzaConsigliata };
});
