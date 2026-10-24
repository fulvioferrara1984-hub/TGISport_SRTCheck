// Analisi delle stringhe SRT (app/stringa.js): avvisi e stringa pronta.
const test = require('node:test');
const assert = require('node:assert/strict');
const stringa = require('../app/stringa.js');

const codici = (lista) => lista.map((m) => m.codice);
const BASE = 'srt://203.0.113.10:9000?';

test('latenza che sembra in millisecondi: corretta e annullabile', () => {
  const r = stringa.analizza(BASE + 'latency=2000');
  const a = r.avvisi.find((m) => m.codice === 'latenza-ms');
  assert.ok(a && a.annullabile === true);
  assert.ok(r.pronta.includes('latency=2000000'));
  assert.equal(r.riepilogo.latenzaMs, 2000);
  assert.ok(!codici(r.avvisi).includes('latenza-bassa'));
});

test('latenza in millisecondi: con "Keep the original value" resta 2000 (2 ms)', () => {
  const r = stringa.analizza(BASE + 'latency=2000', { tieniOriginali: ['latenza-ms'] });
  assert.ok(r.pronta.includes('latency=2000') && !r.pronta.includes('latency=2000000'));
  assert.equal(r.riepilogo.latenzaMs, 2);
  assert.ok(codici(r.avvisi).includes('latenza-bassa'));
  assert.ok(!codici(r.avvisi).includes('latenza-ms'));
});

test('rcvlatency e peerlatency: stessa correzione', () => {
  for (const nome of ['rcvlatency', 'peerlatency']) {
    const r = stringa.analizza(BASE + nome + '=500');
    assert.ok(codici(r.avvisi).includes('latenza-ms'), nome);
    assert.ok(r.pronta.includes(nome + '=500000'), nome);
  }
});

test('latency=0: niente correzione, latenza bassa', () => {
  const r = stringa.analizza(BASE + 'latency=0');
  assert.ok(!codici(r.avvisi).includes('latenza-ms'));
  assert.ok(codici(r.avvisi).includes('latenza-bassa'));
});

test('latenza bassa, normale, alta', () => {
  assert.ok(codici(stringa.analizza(BASE + 'latency=80000').avvisi).includes('latenza-bassa'));
  assert.deepEqual(stringa.analizza(BASE + 'latency=120000').avvisi, []);
  assert.ok(codici(stringa.analizza(BASE + 'latency=9000000').avvisi).includes('latenza-alta'));
});

test('+ nella passphrase: FFmpeg lo leggerebbe come spazio, nella stringa pronta diventa %2B', () => {
  const r = stringa.analizza(BASE + 'passphrase=abc+defghij');
  assert.ok(codici(r.avvisi).includes('carattere-codificato'));
  assert.ok(r.pronta.includes('passphrase=abc%2Bdefghij'));
  assert.equal(r.riepilogo.passphrase, 'abc+defghij');
});

test('% non valido, # e spazio nella passphrase: codificati', () => {
  const casi = [['abc%zzdefghij', 'abc%25zzdefghij'], ['abcdefghij#1', 'abcdefghij%231'], ['abc defghij', 'abc%20defghij']];
  for (const [dentro, fuori] of casi) {
    const r = stringa.analizza(BASE + 'passphrase=' + dentro);
    assert.ok(codici(r.avvisi).includes('carattere-codificato'), dentro);
    assert.ok(r.pronta.includes('passphrase=' + fuori), r.pronta);
  }
});

test('stream ID: caratteri riservati codificati senza avviso', () => {
  const r = stringa.analizza(BASE + 'streamid=#!::r=live,m=request');
  assert.ok(r.pronta.includes('streamid=%23%21%3A%3Ar%3Dlive%2Cm%3Drequest'), r.pronta);
  assert.equal(r.riepilogo.streamId, '#!::r=live,m=request');
});

test('& dentro la passphrase: riunita, codificata e annullabile', () => {
  const r = stringa.analizza(BASE + 'passphrase=abcde&fghij&latency=200000');
  const a = r.avvisi.find((m) => m.codice === 'and-nella-passphrase');
  assert.ok(a && a.annullabile === true);
  assert.deepEqual(r.errori, []);
  assert.equal(r.riepilogo.passphrase, 'abcde&fghij');
  assert.ok(r.pronta.includes('passphrase=abcde%26fghij'));
  assert.ok(r.pronta.includes('latency=200000'));
});

test('& dentro la passphrase, valore originale tenuto: parametro sconosciuto', () => {
  const r = stringa.analizza(BASE + 'passphrase=abcde&fghij&latency=200000', { tieniOriginali: ['and-nella-passphrase'] });
  const e = r.errori.find((m) => m.codice === 'parametro-sconosciuto');
  assert.ok(e && e.parametro === 'fghij');
});

test('parametro scritto male dopo la passphrase: non viene unito', () => {
  const r = stringa.analizza(BASE + 'passphrase=abcdefghij&pbkeylenn=16');
  assert.ok(!codici(r.avvisi).includes('and-nella-passphrase'));
  const e = r.errori.find((m) => m.codice === 'parametro-sconosciuto');
  assert.ok(e && e.testo.includes('`pbkeylen`'), e && e.testo);
});

test('altri avvisi', () => {
  const lunga = 'a'.repeat(80);
  assert.ok(codici(stringa.analizza(BASE + 'passphrase=' + lunga).avvisi).includes('passphrase-lunga'));
  assert.ok(!codici(stringa.analizza(BASE + 'passphrase=' + 'a'.repeat(79)).avvisi).includes('passphrase-lunga'));
  assert.ok(codici(stringa.analizza('srt://192.168.1.20:9000?mode=listener').avvisi).includes('listener-indirizzo'));
  assert.ok(!codici(stringa.analizza('srt://0.0.0.0:9000?mode=listener').avvisi).includes('listener-indirizzo'));
  assert.ok(codici(stringa.analizza(BASE + 'pbkeylen=16').avvisi).includes('pbkeylen-senza-passphrase'));
  assert.ok(codici(stringa.analizza(BASE + 'transtype=file').avvisi).includes('transtype-file'));
  assert.ok(codici(stringa.analizza(BASE + 'mode=rendezvous').avvisi).includes('rendezvous'));
});

test('stringa pronta: ordine dei parametri e codifica', () => {
  const r = stringa.analizza(BASE + 'maxbw=-1&passphrase=abcdefghij&mode=caller&latency=200000');
  assert.equal(r.pronta, 'srt://203.0.113.10:9000?mode=caller&latency=200000&passphrase=abcdefghij&maxbw=-1');
  assert.equal(stringa.analizza('srt://203.0.113.10:9000').pronta, 'srt://203.0.113.10:9000');
});

test('codificaValore: tutto tranne A-Z a-z 0-9 - . _ ~', () => {
  assert.equal(stringa.codificaValore('aZ09-._~'), 'aZ09-._~');
  assert.equal(stringa.codificaValore("a+b&c%d#e f!'()*"), 'a%2Bb%26c%25d%23e%20f%21%27%28%29%2A');
  assert.equal(stringa.codificaValore('è'), '%C3%A8');
});

test('la stringa pronta è stabile: rianalizzata non cambia e non ha più correzioni', () => {
  const casi = [
    'latency=2000', 'rcvlatency=500', 'passphrase=abc+defghij', 'passphrase=abc%zzdefghij', 'passphrase=abcdefghij#1',
    'passphrase=abc defghij', 'streamid=#!::r=live,m=request', 'passphrase=abcde&fghij&latency=200000',
    'maxbw=-1&passphrase=abcdefghij&mode=caller&latency=200000', 'passphrase=' + 'a'.repeat(80), 'mode=rendezvous',
  ];
  for (const c of casi) {
    const prima = stringa.analizza(BASE + c);
    assert.deepEqual(prima.errori, [], c);
    const dopo = stringa.analizza(prima.pronta);
    assert.equal(dopo.pronta, prima.pronta, c);
    for (const codice of ['carattere-codificato', 'latenza-ms', 'and-nella-passphrase']) {
      assert.ok(!codici(dopo.avvisi).includes(codice), `${c}: ${codice}`);
    }
    assert.deepEqual(dopo.note, [], c);
  }
});

test('parametro ripetuto: avviso, la stringa pronta tiene l\'ultimo come FFmpeg', () => {
  const r = stringa.analizza(BASE + 'latency=200000&latency=500000');
  assert.ok(codici(r.avvisi).includes('parametro-doppio'));
  assert.equal((r.pronta.match(/latency=/g) || []).length, 1);
  assert.ok(r.pronta.includes('latency=500000') && !r.pronta.includes('200000'), r.pronta);
  assert.equal(r.riepilogo.latenzaMs, 500);
});

test('%XX che non formano UTF-8 valido: restano come scritti, con avviso', () => {
  const r = stringa.analizza(BASE + 'passphrase=abc%E2%82defghij');
  assert.ok(codici(r.avvisi).includes('codifica-non-valida'));
  assert.ok(r.pronta.includes('passphrase=abc%E2%82defghij'), r.pronta);
  assert.equal(stringa.analizza(r.pronta).pronta, r.pronta);
});

test('smoother: i testi dicono "smoother", non "stream ID"', () => {
  const a = stringa.analizza(BASE + 'smoother=live+x').avvisi.find((m) => m.codice === 'carattere-codificato');
  assert.ok(a && a.testo.includes('smoother') && !a.testo.includes('stream ID'), a && a.testo);
});
