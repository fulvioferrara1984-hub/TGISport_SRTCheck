// Analisi delle stringhe SRT (app/stringa.js): pulizia, riepilogo, errori.
const test = require('node:test');
const assert = require('node:assert/strict');
const stringa = require('../app/stringa.js');

const codici = (lista) => lista.map((m) => m.codice);
const PULITA = 'srt://203.0.113.10:9000?latency=200000';

test('stringa semplice: caller, porta, latenza di default, senza cifratura', () => {
  const r = stringa.analizza('srt://203.0.113.10:9000');
  assert.deepEqual(r.errori, []);
  assert.equal(r.riepilogo.modalita, 'caller');
  assert.equal(r.riepilogo.host, '203.0.113.10');
  assert.equal(r.riepilogo.porta, 9000);
  assert.equal(r.riepilogo.latenzaMs, null);
  assert.equal(r.riepilogo.cifrato, false);
  assert.equal(r.riepilogo.passphrase, null);
  assert.ok(r.pronta.startsWith('srt://203.0.113.10:9000'));
});

test('spezzata-su-righe: le righe si ricompongono', () => {
  const r = stringa.analizza('srt://203.0.113.10:90\n00?passphrase=abcdefghij');
  assert.equal(r.riepilogo.porta, 9000);
  assert.equal(r.riepilogo.passphrase, 'abcdefghij');
  assert.ok(codici(r.note).includes('a-capo'));
});

test('incollata-da-mail: virgolette tipografiche e punto finale', () => {
  const r = stringa.analizza('“srt://203.0.113.10:9000?latency=200000”.');
  assert.deepEqual(r.riepilogo, stringa.analizza(PULITA).riepilogo);
  assert.ok(codici(r.note).includes('contorno'));
});

test('incollata-da-mail: parentesi angolari', () => {
  const r = stringa.analizza('<srt://example.com:9000>');
  assert.equal(r.riepilogo.host, 'example.com');
  assert.ok(codici(r.note).includes('contorno'));
});

test('incollata-da-mail: spazio non separabile e carattere invisibile', () => {
  const r = stringa.analizza('srt://203.0.113.10:​9000?latency= 200000');
  assert.deepEqual(r.errori, []);
  assert.deepEqual(r.riepilogo, stringa.analizza(PULITA).riepilogo);
  assert.ok(codici(r.note).includes('caratteri-invisibili'));
});

test('spazi fuori dalla passphrase tolti con una nota', () => {
  const r = stringa.analizza('srt:// 203.0.113.10:9000 ? latency = 200000');
  assert.deepEqual(r.riepilogo, stringa.analizza(PULITA).riepilogo);
  assert.ok(codici(r.note).includes('spazi'));
});

test('schema corretto: SRT://, srt:/, srt:', () => {
  for (const s of ['SRT://203.0.113.10:9000', 'srt:/203.0.113.10:9000', 'srt:203.0.113.10:9000']) {
    const r = stringa.analizza(s);
    assert.deepEqual(r.errori, [], s);
    assert.equal(r.riepilogo.porta, 9000, s);
    assert.ok(codici(r.note).includes('schema'), s);
  }
});

test('schema mancante: aggiunto', () => {
  const r = stringa.analizza('203.0.113.10:9000?mode=listener');
  assert.equal(r.riepilogo.modalita, 'listener');
  assert.ok(codici(r.note).includes('schema-aggiunto'));
});

test('schema di un altro protocollo: errore', () => {
  const r = stringa.analizza('udp://203.0.113.10:9000');
  assert.ok(codici(r.errori).includes('schema-sconosciuto'));
  assert.equal(r.pronta, null);
});

test('mode in maiuscolo: portato in minuscolo', () => {
  const r = stringa.analizza('srt://203.0.113.10:9000?mode=LISTENER');
  assert.equal(r.riepilogo.modalita, 'listener');
  assert.ok(codici(r.note).includes('mode-minuscolo'));
});

test('listener senza indirizzo: ascolta su 0.0.0.0', () => {
  const r = stringa.analizza('srt://:9000?mode=listener');
  assert.deepEqual(r.errori, []);
  assert.equal(r.riepilogo.host, '0.0.0.0');
  assert.ok(codici(r.note).includes('listener-tutti'));
  assert.ok(r.pronta.startsWith('srt://0.0.0.0:9000'));
});

test('caller senza indirizzo: errore', () => {
  const r = stringa.analizza('srt://:9000');
  assert.ok(codici(r.errori).includes('host-mancante'));
  assert.equal(r.pronta, null);
});

test('IPv6 tra parentesi quadre', () => {
  const r = stringa.analizza('srt://[2001:db8::1]:9000');
  assert.equal(r.riepilogo.host, '2001:db8::1');
  assert.equal(r.riepilogo.porta, 9000);
  assert.ok(r.pronta.startsWith('srt://[2001:db8::1]:9000'));
});

test('porta mancante o non valida: errore', () => {
  for (const s of ['srt://203.0.113.10', 'srt://203.0.113.10:0', 'srt://203.0.113.10:70000', 'srt://203.0.113.10:90a']) {
    const r = stringa.analizza(s);
    assert.ok(codici(r.errori).includes('porta'), s);
    assert.equal(r.pronta, null, s);
  }
});

test('passphrase sotto i 10 caratteri: errore', () => {
  assert.ok(codici(stringa.analizza('srt://203.0.113.10:9000?passphrase=abcdefghi').errori).includes('passphrase-corta'));
});

test('passphrase lunga 10 caratteri dopo la decodifica: va bene', () => {
  const r = stringa.analizza('srt://203.0.113.10:9000?passphrase=abc%2Bdefghi');
  assert.deepEqual(r.errori, []);
  assert.equal(r.riepilogo.passphrase, 'abc+defghi');
  assert.equal(r.riepilogo.cifrato, true);
});

test('la lunghezza si conta dopo la decodifica: 11 caratteri scritti, 9 veri', () => {
  const r = stringa.analizza('srt://203.0.113.10:9000?passphrase=abc%2Bdefgh');
  assert.ok(codici(r.errori).includes('passphrase-corta'));
});

test('pbkeylen non ammesso: errore', () => {
  assert.ok(codici(stringa.analizza('srt://203.0.113.10:9000?passphrase=abcdefghij&pbkeylen=20').errori).includes('pbkeylen'));
});

test('mode sconosciuto: errore', () => {
  assert.ok(codici(stringa.analizza('srt://203.0.113.10:9000?mode=server').errori).includes('mode'));
});

test('parametro scritto male: errore con il suggerimento', () => {
  const r = stringa.analizza('srt://203.0.113.10:9000?pasphrase=abcdefghij');
  const e = r.errori.find((m) => m.codice === 'parametro-sconosciuto');
  assert.ok(e);
  assert.ok(e.testo.includes('`passphrase`'), e.testo);
  assert.equal(r.pronta, null);
});

test('nome di un altro strumento SRT: errore con il nome FFmpeg', () => {
  const e = stringa.analizza('srt://203.0.113.10:9000?conntimeo=3000').errori.find((m) => m.codice === 'parametro-sconosciuto');
  assert.ok(e && e.testo.includes('`connect_timeout`'), e && e.testo);
});

test('valore non numerico: errore', () => {
  assert.ok(codici(stringa.analizza('srt://203.0.113.10:9000?latency=abc').errori).includes('valore-non-valido'));
});

test('transtype sconosciuto: errore', () => {
  assert.ok(codici(stringa.analizza('srt://203.0.113.10:9000?transtype=video').errori).includes('transtype'));
});

test('testo vuoto: errore', () => {
  for (const s of ['', '   ', '\n']) {
    const r = stringa.analizza(s);
    assert.deepEqual(codici(r.errori), ['vuota']);
    assert.equal(r.pronta, null);
    assert.equal(r.riepilogo, null);
  }
});

test('stream ID e altri parametri nel riepilogo, decodificati', () => {
  const r = stringa.analizza('srt://203.0.113.10:9000?streamid=%23%21%3A%3Ar%3Dlive&maxbw=-1');
  assert.equal(r.riepilogo.streamId, '#!::r=live');
  assert.deepEqual(r.riepilogo.parametri, [{ nome: 'streamid', valore: '#!::r=live' }, { nome: 'maxbw', valore: '-1' }]);
});

test('elenco dei parametri di FFmpeg 9', () => {
  for (const nome of ['timeout', 'listen_timeout', 'pkt_size', 'payload_size', 'passphrase', 'pbkeylen', 'latency', 'rcvlatency', 'peerlatency', 'connect_timeout', 'mode', 'streamid', 'srt_streamid', 'transtype', 'ipv6only']) {
    assert.ok(stringa.PARAMETRI[nome], nome);
  }
  assert.equal(stringa.PARAMETRI.latency.unita, 'us');
  assert.equal(stringa.PARAMETRI.connect_timeout.unita, 'ms');
  assert.equal(stringa.ALIAS.conntimeo, 'connect_timeout');
});

test('incollata-da-mail con la passphrase per ultima: virgolette e punto finale non entrano nella passphrase', () => {
  for (const s of ['“srt://203.0.113.10:9000?passphrase=abcdefghij”.', '"srt://203.0.113.10:9000?passphrase=abcdefghij".', '<srt://203.0.113.10:9000?passphrase=abcdefghij>.']) {
    const r = stringa.analizza(s);
    assert.equal(r.riepilogo.passphrase, 'abcdefghij', s);
    assert.ok(codici(r.note).includes('contorno'), s);
  }
});

test('passphrase che finisce con un punto o una virgola: tolto, con avviso annullabile', () => {
  const r = stringa.analizza('srt://203.0.113.10:9000?passphrase=abcdefghij.');
  const a = r.avvisi.find((m) => m.codice === 'fine-sospetta');
  assert.ok(a && a.annullabile === true);
  assert.equal(r.riepilogo.passphrase, 'abcdefghij');
  assert.ok(r.pronta.endsWith('passphrase=abcdefghij'));
  const tenuta = stringa.analizza('srt://203.0.113.10:9000?passphrase=abcdefghij.', { tieniOriginali: ['fine-sospetta'] });
  assert.equal(tenuta.riepilogo.passphrase, 'abcdefghij.');
  assert.ok(codici(stringa.analizza('srt://203.0.113.10:9000?streamid=live,').avvisi).includes('fine-sospetta'));
});

test('caratteri di formato invisibili (trattino morbido, segni di direzione di Outlook/Teams): tolti', () => {
  const r = stringa.analizza('‎srt://203.0.113.10:9000?passphrase=abc­defghij‏‪');
  assert.deepEqual(r.errori, []);
  assert.equal(r.riepilogo.passphrase, 'abcdefghij');
  assert.ok(codici(r.note).includes('caratteri-invisibili'));
});

test('host tra parentesi quadre che non è IPv6: errore', () => {
  assert.ok(codici(stringa.analizza('srt://[203.0.113.10]:9000').errori).includes('host-non-valido'));
});

test('caller verso 0.0.0.0 o ::: non è un indirizzo a cui collegarsi', () => {
  for (const s of ['srt://0.0.0.0:9000', 'srt://[::]:9000', 'srt://0.0.0.0:9000?mode=rendezvous']) {
    const r = stringa.analizza(s);
    assert.ok(codici(r.errori).includes('host-non-raggiungibile'), s);
    assert.equal(r.pronta, null, s);
  }
  assert.deepEqual(stringa.analizza('srt://0.0.0.0:9000?mode=listener').errori, []);
});

test('latenza negativa: errore', () => {
  for (const nome of ['latency', 'rcvlatency', 'peerlatency']) {
    assert.ok(codici(stringa.analizza(`srt://203.0.113.10:9000?${nome}=-5000`).errori).includes('valore-non-valido'), nome);
  }
});

test('tsbpddelay negativo: errore', () => {
  assert.ok(codici(stringa.analizza('srt://203.0.113.10:9000?tsbpddelay=-5000').errori).includes('valore-non-valido'));
});
