/* SRT Check — analisi e composizione delle stringhe srt:// per FFmpeg (stessa logica per Check e Build). */
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (radice.SC = radice.SC || {})[m.NOME] = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Opzioni del protocollo srt di FFmpeg 9 (`ffmpeg -h protocol=srt`). Unità: us = microsecondi, ms = millisecondi.
  const INT = { tipo: 'int' }, BOOL = { tipo: 'bool' }, TESTO = { tipo: 'string' };
  const PARAMETRI = {
    timeout: { tipo: 'int', unita: 'us' },
    listen_timeout: { tipo: 'int', unita: 'us' },
    send_buffer_size: INT,
    recv_buffer_size: INT,
    pkt_size: { tipo: 'int', costanti: ['ts_size', 'max_size'] },
    payload_size: { tipo: 'int', costanti: ['ts_size', 'max_size'] },
    maxbw: INT,
    pbkeylen: INT,
    passphrase: TESTO,
    enforced_encryption: BOOL,
    kmrefreshrate: INT,
    kmpreannounce: INT,
    snddropdelay: { tipo: 'int', unita: 'us' },
    mss: INT,
    ffs: INT,
    ipttl: INT,
    iptos: INT,
    inputbw: INT,
    oheadbw: INT,
    latency: { tipo: 'int', unita: 'us' },
    tsbpddelay: { tipo: 'int', unita: 'us' },
    rcvlatency: { tipo: 'int', unita: 'us' },
    peerlatency: { tipo: 'int', unita: 'us' },
    tlpktdrop: BOOL,
    nakreport: BOOL,
    connect_timeout: { tipo: 'int', unita: 'ms' },
    mode: { tipo: 'enum', valori: ['caller', 'listener', 'rendezvous'] },
    sndbuf: INT,
    rcvbuf: INT,
    lossmaxttl: INT,
    minversion: INT,
    streamid: TESTO,
    srt_streamid: TESTO,
    smoother: TESTO,
    messageapi: BOOL,
    transtype: { tipo: 'enum', valori: ['live', 'file'] },
    linger: INT,
    tsbpd: BOOL,
    ipv6only: BOOL,
  };

  // Nomi usati da altri strumenti SRT (srt-live-transmit, apparati) → nome FFmpeg.
  const ALIAS = { conntimeo: 'connect_timeout', payloadsize: 'payload_size', enforcedencryption: 'enforced_encryption' };

  // Parametri il cui valore è testo libero: dentro si conservano gli spazi.
  const LIBERI = ['passphrase', 'streamid', 'srt_streamid', 'smoother'];
  const ORDINE = ['mode', 'latency', 'passphrase', 'pbkeylen', 'streamid'];
  const PBKEYLEN = [0, 16, 24, 32];

  // caratteri di formato invisibili (categoria Unicode Cf): spazi a larghezza zero, trattino morbido, segni di direzione
  // che Outlook e Teams aggiungono copiando; dentro la passphrase darebbero BADSECRET senza che si vedano
  const INVISIBILI = /\p{Cf}/gu;
  const SPAZI_SPECIALI = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
  const APERTI = '“‘"\'`<([';
  const CHIUSI = '”’"\'`>)]';

  function messaggio(codice, testo, parametro) {
    const m = { codice, testo };
    if (parametro) m.parametro = parametro;
    return m;
  }

  function distanza(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  function suggerimento(nome) {
    let migliore = null, minima = 3;
    for (const noto of Object.keys(PARAMETRI)) {
      const d = distanza(nome, noto);
      if (d < minima) { minima = d; migliore = noto; }
    }
    return migliore;
  }

  // Decodifica %XX come fa FFmpeg; un % non valido resta com'è. Il + resta + (lo segnala l'avviso dedicato).
  // esito.rotta = true se qualche %XX non forma UTF-8 valido (quel valore poi resta scritto com'era).
  function decodifica(valore, esito) {
    return valore.replace(/(%[0-9a-fA-F]{2})+/g, (pezzo) => {
      try { return decodeURIComponent(pezzo); } catch (e) { if (esito) esito.rotta = true; return pezzo; }
    });
  }

  function etichettaDi(nome) {
    return { passphrase: 'passphrase', smoother: 'smoother' }[nome] || 'stream ID';
  }

  function ultimoParametroLibero(testo) {
    const q = testo.indexOf('?');
    if (q < 0) return false;
    const ultimo = testo.slice(q + 1).split('&').pop().trim().toLowerCase();
    return LIBERI.some((n) => ultimo.startsWith(n + '='));
  }

  // Toglie ciò che arriva copiando da mail, PDF e chat: caratteri invisibili, righe spezzate, virgolette e punteggiatura intorno.
  function pulisci(testo, note) {
    let s = String(testo == null ? '' : testo);
    const senzaInvisibili = s.replace(INVISIBILI, '').replace(SPAZI_SPECIALI, ' ');
    if (senzaInvisibili !== s) note.push(messaggio('caratteri-invisibili', 'Removed invisible characters (often added when copying from emails or PDFs).'));
    s = senzaInvisibili.trim();
    if (/[\r\n]/.test(s)) {
      s = s.replace(/[ \t]*[\r\n]+[ \t]*/g, '');
      note.push(messaggio('a-capo', 'Joined the lines of a string that was split over several lines.'));
    }
    // Se all'inizio c'era una virgoletta o una parentesi, la punteggiatura e la chiusura in fondo sono del testo intorno;
    // altrimenti in fondo si toglie solo se l'ultimo parametro non è testo libero (lì decide l'avviso "fine-sospetta").
    const tolti = [];
    let aperti = 0;
    for (let cambiato = true; cambiato && s;) {
      cambiato = false;
      if (APERTI.includes(s[0])) { tolti.push(s[0]); s = s.slice(1).trim(); aperti++; cambiato = true; }
      const libero = !aperti && ultimoParametroLibero(s);
      if (s && '.,;'.includes(s[s.length - 1]) && !libero) { tolti.push(s[s.length - 1]); s = s.slice(0, -1).trim(); cambiato = true; }
      if (s && CHIUSI.includes(s[s.length - 1]) && !libero) {
        tolti.push(s[s.length - 1]); s = s.slice(0, -1).trim(); cambiato = true;
        if (aperti) aperti--;
      }
    }
    if (tolti.length) note.push(messaggio('contorno', `Removed ${tolti.map((c) => '“' + c + '”').join(' ')} around the string.`));
    return s;
  }

  // Separa schema e resto; null se è l'indirizzo di un altro protocollo.
  function schema(s, note, errori) {
    const m = /^([a-z][a-z0-9+.-]*)\s*:\s*(\/*)/i.exec(s);
    if (m && m[1].toLowerCase() === 'srt') {
      if (m[0] !== 'srt://') note.push(messaggio('schema', 'Corrected the beginning to srt://.'));
      return s.slice(m[0].length);
    }
    if (m && m[2]) {
      errori.push(messaggio('schema-sconosciuto', `This is a ${m[1]}:// address, not an SRT one: SRT strings start with srt://.`));
      return null;
    }
    note.push(messaggio('schema-aggiunto', 'Added srt:// at the beginning.'));
    return s;
  }

  function valida(nome, valore, errori) {
    const def = PARAMETRI[nome];
    if (['latency', 'rcvlatency', 'peerlatency'].includes(nome) && /^-\d+$/.test(valore)) {
      errori.push(messaggio('valore-non-valido', `\`${nome}\` cannot be negative.`, nome));
    } else if (def.tipo === 'int' && !/^-?\d+$/.test(valore) && !(def.costanti || []).includes(valore)) {
      errori.push(messaggio('valore-non-valido', `\`${nome}\` needs a whole number, not “${valore}”.`, nome));
    } else if (def.tipo === 'bool' && !/^(0|1|true|false)$/i.test(valore)) {
      errori.push(messaggio('valore-non-valido', `\`${nome}\` needs 0 or 1, not “${valore}”.`, nome));
    } else if (nome === 'mode' && !def.valori.includes(valore)) {
      errori.push(messaggio('mode', 'mode must be caller, listener or rendezvous.', nome));
    } else if (nome === 'transtype' && !def.valori.includes(valore)) {
      errori.push(messaggio('transtype', 'transtype must be live or file.', nome));
    } else if (nome === 'pbkeylen' && /^-?\d+$/.test(valore) && !PBKEYLEN.includes(Number(valore))) {
      errori.push(messaggio('pbkeylen', 'pbkeylen must be 16, 24 or 32 (key length in bytes), or 0 for the default.', nome));
    }
  }

  function erroreSconosciuto(nome) {
    const alias = ALIAS[nome];
    const simile = alias ? null : suggerimento(nome);
    let testo = `FFmpeg does not know \`${nome}\` and refuses the whole string (“Option not found”).`;
    if (alias) testo += ` Did you mean \`${alias}\`? \`${nome}\` is the name used by other SRT tools.`;
    else if (simile) testo += ` Did you mean \`${simile}\`?`;
    else testo += ' Remove it.';
    return messaggio('parametro-sconosciuto', testo, nome);
  }

  // Legge la query: [{nome, grezzo, valore}] con valore decodificato. Un "&" dentro passphrase o stream ID
  // spezzerebbe il valore: il pezzo che segue, se non è un parametro, viene riunito (salvo "Keep the original value").
  function leggiQuery(query, note, errori, avvisi, tieni) {
    const parametri = [];
    let spazi = false, maiuscole = false;
    for (const pezzo of query.split('&')) {
      if (!pezzo.trim()) continue;
      const uguale = pezzo.indexOf('=');
      const nomeGrezzo = uguale < 0 ? pezzo : pezzo.slice(0, uguale);
      let nome = nomeGrezzo.replace(/\s+/g, '');
      const precedente = parametri[parametri.length - 1];
      const sconosciuto = uguale < 0 || !PARAMETRI[nome.toLowerCase()];
      if (sconosciuto && precedente && LIBERI.includes(precedente.nome) && !tieni.includes('and-nella-passphrase')
        && (uguale < 0 || (!ALIAS[nome.toLowerCase()] && !suggerimento(nome.toLowerCase())))) {
        precedente.grezzo += '&' + pezzo;
        precedente.unito = true;
        continue;
      }
      if (nome !== nomeGrezzo) spazi = true;
      if (nome !== nome.toLowerCase()) { nome = nome.toLowerCase(); maiuscole = true; }
      if (sconosciuto) {
        errori.push(erroreSconosciuto(nome));
        continue;
      }
      parametri.push({ nome, grezzo: pezzo.slice(uguale + 1) });
    }
    for (const p of parametri) {
      const grezzoIntero = p.grezzo;
      p.grezzo = LIBERI.includes(p.nome) ? grezzoIntero.trim() : grezzoIntero.replace(/\s+/g, '');
      if (p.grezzo !== grezzoIntero) spazi = true;
      if (p.nome === 'mode' && p.grezzo !== p.grezzo.toLowerCase()) {
        p.grezzo = p.grezzo.toLowerCase();
        note.push(messaggio('mode-minuscolo', 'Wrote mode in lower case, as FFmpeg expects.'));
      }
      const etichetta = etichettaDi(p.nome);
      if (p.unito) {
        const a = messaggio('and-nella-passphrase', `The ${etichetta} seems to contain “&”, which FFmpeg reads as the start of a new parameter. The ready string joins it back and writes it as %26.`, p.nome);
        a.annullabile = true;
        avvisi.push(a);
      }
      if (LIBERI.includes(p.nome) && /\+|%(?![0-9a-fA-F]{2})|#| /.test(p.grezzo)) {
        avvisi.push(messaggio('carattere-codificato', `The ${etichetta} contains characters that FFmpeg reads differently (“+” becomes a space, “%”, “#” and spaces break it). The ready string encodes them, so it arrives exactly as typed.`, p.nome));
      }
      const esito = {};
      p.valore = decodifica(p.grezzo, esito);
      if (esito.rotta && LIBERI.includes(p.nome)) {
        p.rotta = true;
        avvisi.push(messaggio('codifica-non-valida', `The ${etichetta} contains %-codes that are not valid text: the ready string keeps them exactly as written. Check them with whoever sent the string.`, p.nome));
      }
      valida(p.nome, p.valore, errori);
    }
    if (maiuscole) note.push(messaggio('nome-minuscolo', 'Wrote parameter names in lower case, as FFmpeg expects.'));
    // parametro ripetuto: FFmpeg applica i valori in ordine, quindi vale l'ultimo
    const ultimo = new Map();
    parametri.forEach((p, i) => ultimo.set(p.nome, i));
    for (const nome of new Set(parametri.filter((p, i) => ultimo.get(p.nome) !== i).map((p) => p.nome))) {
      avvisi.push(messaggio('parametro-doppio', `\`${nome}\` appears more than once: FFmpeg uses the last value, so the ready string keeps only that one.`, nome));
    }
    return { parametri: parametri.filter((p, i) => ultimo.get(p.nome) === i), spazi };
  }

  // FFmpeg legge le latenze in microsecondi: un valore sotto 10000 (10 ms) è quasi sempre scritto in millisecondi.
  function correggiLatenze(parametri, avvisi, tieni) {
    if (tieni.includes('latenza-ms')) return;
    for (const p of parametri) {
      if (!['latency', 'rcvlatency', 'peerlatency'].includes(p.nome) || !/^\d+$/.test(p.valore)) continue;
      const v = Number(p.valore);
      if (v <= 0 || v >= 10000) continue;
      p.grezzo = p.valore = String(v * 1000);
      const a = messaggio('latenza-ms', `FFmpeg reads \`${p.nome}\` in microseconds: ${v} would mean ${v / 1000} ms. It looks like milliseconds, so the ready string uses ${v * 1000} (${v} ms).`, p.nome);
      a.annullabile = true;
      avvisi.push(a);
    }
  }

  // Passphrase o stream ID in fondo alla stringa che finiscono con punteggiatura, virgolette o parentesi: quasi sempre
  // sono state copiate insieme alla stringa da una mail. Si tolgono, con "Keep the original value" per tenerle.
  function fineSospetta(parametri, avvisi, tieni) {
    const p = parametri[parametri.length - 1];
    if (!p || !LIBERI.includes(p.nome) || tieni.includes('fine-sospetta')) return;
    const m = /[.,;"'\u201D\u2019)\]>]+$/.exec(p.valore);
    if (!m || m.index === 0) return;
    p.valore = p.valore.slice(0, m.index);
    const etichetta = etichettaDi(p.nome);
    const a = messaggio('fine-sospetta', `The ${etichetta} ended with “${m[0]}”, which is usually punctuation copied together with the string: it was removed. If it is really part of the ${etichetta}, keep the original value.`, p.nome);
    a.annullabile = true;
    avvisi.push(a);
  }

  function avvisiFinali(riepilogo, parametri, avvisi) {
    const ms = riepilogo.latenzaMs;
    if (ms !== null && ms < 120) avvisi.push(messaggio('latenza-bassa', `Latency ${ms} ms is below the SRT default (120 ms): fine on a local network, risky over the internet.`));
    if (ms !== null && ms > 8000) avvisi.push(messaggio('latenza-alta', `Latency ${ms} ms is unusually high: check that it is what the source expects.`));
    if (riepilogo.passphrase && riepilogo.passphrase.length > 79) avvisi.push(messaggio('passphrase-lunga', 'The passphrase is longer than 79 characters: some devices accept at most 79.', 'passphrase'));
    if (riepilogo.modalita === 'listener' && !['0.0.0.0', '::', ''].includes(riepilogo.host)) {
      avvisi.push(messaggio('listener-indirizzo', `This PC will listen only on ${riepilogo.host}: that works only if it is an address of this PC. To listen on every network use srt://0.0.0.0:${riepilogo.porta}?mode=listener.`));
    }
    if (parametri.some((p) => p.nome === 'pbkeylen') && !riepilogo.cifrato) avvisi.push(messaggio('pbkeylen-senza-passphrase', 'pbkeylen has no effect without a passphrase.', 'pbkeylen'));
    if (parametri.some((p) => p.nome === 'transtype' && p.valore === 'file')) avvisi.push(messaggio('transtype-file', 'transtype=file is meant for file transfers, not live video.', 'transtype'));
    if (riepilogo.modalita === 'rendezvous') avvisi.push(messaggio('rendezvous', 'Rendezvous mode is rare: both sides must use it, each with the other one\'s address.', 'mode'));
  }

  // Percent-encoding di tutto tranne A-Z a-z 0-9 - . _ ~ (FFmpeg e srt-live-transmit decodificano %XX).
  function codificaValore(v) {
    return encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }

  function leggiIndirizzo(autorita) {
    let host, porta;
    if (autorita.startsWith('[')) {
      const chiusa = autorita.indexOf(']');
      host = chiusa < 0 ? autorita.slice(1) : autorita.slice(1, chiusa);
      porta = chiusa < 0 ? '' : autorita.slice(chiusa + 1).replace(/^:/, '');
      return { host, porta, ipv6: true, conPorta: chiusa >= 0 && autorita[chiusa + 1] === ':' };
    }
    const due = autorita.indexOf(':');
    return { host: due < 0 ? autorita : autorita.slice(0, due), porta: due < 0 ? '' : autorita.slice(due + 1), ipv6: false, conPorta: due >= 0 };
  }

  function componiStringa(host, porta, parametri) {
    const h = host.includes(':') ? `[${host}]` : host;
    const ordinati = [
      ...ORDINE.map((n) => parametri.find((p) => p.nome === n)).filter(Boolean),
      ...parametri.filter((p) => !ORDINE.includes(p.nome)),
    ];
    const query = ordinati.map((p) => `${p.nome}=${LIBERI.includes(p.nome) && !p.rotta ? codificaValore(p.valore) : p.grezzo}`).join('&');
    return `srt://${h}:${porta}${query ? '?' + query : ''}`;
  }

  function analizza(testo, opzioni = {}) {
    const note = [], errori = [], avvisi = [];
    const pulita = pulisci(testo, note);
    if (!pulita) return { pronta: null, riepilogo: null, errori: [messaggio('vuota', 'Paste an srt:// string.')], avvisi: [], note: [] };

    const resto = schema(pulita, note, errori);
    if (resto === null) return { pronta: null, riepilogo: null, errori, avvisi, note };

    const q = resto.indexOf('?');
    const autoritaGrezza = q < 0 ? resto : resto.slice(0, q);
    let autorita = autoritaGrezza.replace(/\s+/g, '');
    let spazi = autorita !== autoritaGrezza;
    autorita = autorita.replace(/\/+$/, '');
    const tieni = opzioni.tieniOriginali || [];
    const letta = leggiQuery(q < 0 ? '' : resto.slice(q + 1), note, errori, avvisi, tieni);
    spazi = spazi || letta.spazi;
    if (spazi) note.push(messaggio('spazi', 'Removed spaces that are not part of the passphrase or stream ID.'));
    const parametri = letta.parametri;
    correggiLatenze(parametri, avvisi, tieni);
    fineSospetta(parametri, avvisi, tieni);
    const valore = (nome) => { const p = parametri.find((x) => x.nome === nome); return p ? p.valore : null; };

    const modalita = PARAMETRI.mode.valori.includes(valore('mode')) ? valore('mode') : 'caller';
    let { host, porta, ipv6 } = leggiIndirizzo(autorita);
    if (ipv6 && !host.includes(':')) {
      errori.push(messaggio('host-non-valido', `Square brackets are only for IPv6 addresses: write ${host} without them.`));
    }
    if (!host) {
      if (modalita === 'listener') {
        host = '0.0.0.0';
        note.push(messaggio('listener-tutti', 'A listener without an address does not start in FFmpeg: changed to 0.0.0.0 (listen on every network of this PC).'));
      } else {
        errori.push(messaggio('host-mancante', 'The address of the source is missing: in caller mode this PC connects to srt://address:port.'));
      }
    }
    if (modalita !== 'listener' && ['0.0.0.0', '::'].includes(host)) {
      errori.push(messaggio('host-non-raggiungibile', `${host} means “every network of this PC”: it is not an address to connect to. Use the address of the source, or mode=listener if the source calls this PC.`));
    }
    const numeroPorta = /^\d+$/.test(porta) ? Number(porta) : NaN;
    if (!(numeroPorta >= 1 && numeroPorta <= 65535)) {
      errori.push(messaggio('porta', 'The port is missing or not valid: it must be a number from 1 to 65535, after the address (srt://address:port).'));
    }

    const passphrase = valore('passphrase');
    if (passphrase && passphrase.length < 10) {
      errori.push(messaggio('passphrase-corta', 'The passphrase must be at least 10 characters long: FFmpeg refuses shorter ones (“Bad parameters”).', 'passphrase'));
    }

    const latenza = ['latency', 'tsbpddelay', 'rcvlatency'].map(valore).find((v) => v !== null && /^-?\d+$/.test(v));
    const riepilogo = {
      modalita,
      host: host || '',
      porta: Number.isNaN(numeroPorta) ? null : numeroPorta,
      latenzaMs: latenza === undefined ? null : Number(latenza) / 1000,
      cifrato: !!passphrase,
      passphrase: passphrase || null,
      pbkeylen: /^\d+$/.test(valore('pbkeylen') || '') ? Number(valore('pbkeylen')) : null,
      streamId: valore('streamid') !== null ? valore('streamid') : valore('srt_streamid'),
      parametri: parametri.map((p) => ({ nome: p.nome, valore: p.valore })),
    };
    avvisiFinali(riepilogo, parametri, avvisi);
    const pronta = errori.length ? null : componiStringa(host, numeroPorta, parametri);
    return { pronta, riepilogo, errori, avvisi, note };
  }

  // Scheda Build: compone la stringa dai dati separati, con la stessa forma della stringa pronta di Check.
  function componi(campi) {
    const errori = [];
    const testo = (v) => (v === undefined || v === null ? '' : String(v)).trim();
    const avvisi = [];
    const modalita = campi.modalita === 'listener' ? 'listener' : 'caller';
    // l'indirizzo può arrivare come "ip:porta", "srt://ip" o "[ipv6]:porta": si tiene solo l'host
    let host = testo(campi.host).replace(INVISIBILI, '').replace(/^srt:\/*/i, '').split(/[/?#]/)[0];
    let portaIndirizzo = '';
    if (host.startsWith('[')) {
      const chiusa = host.indexOf(']');
      if (chiusa > 0) { portaIndirizzo = host.slice(chiusa + 1).replace(/^:/, ''); host = host.slice(1, chiusa); }
    } else if ((host.match(/:/g) || []).length === 1) {
      [host, portaIndirizzo] = host.split(':');
    }
    if (!host && modalita === 'listener') host = '0.0.0.0';
    if (!host) errori.push(messaggio('host-mancante', 'The address of the source is missing: in caller mode this PC connects to it.'));
    else if (/\s/.test(host)) errori.push(messaggio('host-non-valido', 'The address cannot contain spaces.'));
    let porta = testo(campi.porta);
    if (portaIndirizzo && porta && portaIndirizzo !== porta) {
      errori.push(messaggio('porta', `The address says port ${portaIndirizzo} but the Port field says ${porta}.`));
    }
    if (!porta) porta = portaIndirizzo;
    if (!/^\d+$/.test(porta) || Number(porta) < 1 || Number(porta) > 65535) {
      if (!errori.some((e) => e.codice === 'porta')) errori.push(messaggio('porta', 'The port must be a number from 1 to 65535.'));
    }
    const parametri = [];
    if (modalita === 'listener') parametri.push({ nome: 'mode', grezzo: 'listener', valore: 'listener' });
    const latenza = testo(campi.latenzaMs);
    if (latenza) {
      if (!/^\d+(\.\d+)?$/.test(latenza)) errori.push(messaggio('valore-non-valido', 'The latency must be a number of milliseconds.', 'latency'));
      else parametri.push({ nome: 'latency', grezzo: String(Math.round(Number(latenza) * 1000)), valore: String(Math.round(Number(latenza) * 1000)) });
    }
    const passphrase = campi.passphrase === undefined || campi.passphrase === null ? '' : String(campi.passphrase).replace(INVISIBILI, '');
    if (/^\s|\s$/.test(passphrase)) {
      avvisi.push(messaggio('spazi-passphrase', 'The passphrase starts or ends with a space: it is kept, but check that it is really part of it.', 'passphrase'));
    }
    if (passphrase) {
      if (passphrase.length < 10) errori.push(messaggio('passphrase-corta', 'The passphrase must be at least 10 characters long.', 'passphrase'));
      parametri.push({ nome: 'passphrase', valore: passphrase });
      const bit = { 128: 16, 192: 24, 256: 32 }[campi.pbkeylen];
      if (bit) parametri.push({ nome: 'pbkeylen', grezzo: String(bit), valore: String(bit) });
    }
    const streamId = testo(campi.streamId);
    if (streamId) parametri.push({ nome: 'streamid', valore: streamId });
    return { stringa: errori.length ? null : componiStringa(host, Number(porta), parametri), errori, avvisi };
  }

  return { NOME: 'stringa', PARAMETRI, ALIAS, analizza, componi, codificaValore };
});
