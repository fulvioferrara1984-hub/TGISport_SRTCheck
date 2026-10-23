// Composizione delle stringhe SRT dai dati separati (scheda Build).
const test = require('node:test');
const assert = require('node:assert/strict');
const stringa = require('../app/stringa.js');

const codici = (lista) => lista.map((m) => m.codice);

test('caller con latenza in ms, passphrase piena di caratteri speciali e chiave a 256 bit', () => {
  const r = stringa.componi({ modalita: 'caller', host: '203.0.113.10', porta: 9000, latenzaMs: 2000, passphrase: 'a+b&c%d#e f', pbkeylen: 256 });
  assert.deepEqual(r.errori, []);
  assert.equal(r.stringa, 'srt://203.0.113.10:9000?latency=2000000&passphrase=a%2Bb%26c%25d%23e%20f&pbkeylen=32');
  const a = stringa.analizza(r.stringa);
  assert.deepEqual(a.errori, []);
  assert.deepEqual(a.avvisi, []);
  assert.deepEqual(a.note, []);
  assert.equal(a.riepilogo.passphrase, 'a+b&c%d#e f');
  assert.equal(a.pronta, r.stringa);
});

test('listener senza indirizzo: 0.0.0.0', () => {
  const r = stringa.componi({ modalita: 'listener', host: '', porta: '9000' });
  assert.deepEqual(r.errori, []);
  assert.equal(r.stringa, 'srt://0.0.0.0:9000?mode=listener');
});

test('campi facoltativi vuoti: omessi; chiave auto omessa; stream ID codificato', () => {
  const r = stringa.componi({ modalita: 'caller', host: ' example.com ', porta: '9000', latenzaMs: '', passphrase: '', pbkeylen: 'auto', streamId: '#!::r=live' });
  assert.equal(r.stringa, 'srt://example.com:9000?streamid=%23%21%3A%3Ar%3Dlive');
});

test('IPv6 tra parentesi quadre', () => {
  assert.equal(stringa.componi({ modalita: 'caller', host: '2001:db8::1', porta: 9000 }).stringa, 'srt://[2001:db8::1]:9000');
});

test('errori: porta vuota, caller senza indirizzo, passphrase corta, latenza non numerica', () => {
  assert.ok(codici(stringa.componi({ modalita: 'caller', host: '203.0.113.10', porta: '' }).errori).includes('porta'));
  assert.ok(codici(stringa.componi({ modalita: 'caller', host: '', porta: 9000 }).errori).includes('host-mancante'));
  assert.ok(codici(stringa.componi({ modalita: 'caller', host: '203.0.113.10', porta: 9000, passphrase: 'abc' }).errori).includes('passphrase-corta'));
  assert.ok(codici(stringa.componi({ modalita: 'caller', host: '203.0.113.10', porta: 9000, latenzaMs: '2 s' }).errori).includes('valore-non-valido'));
  assert.equal(stringa.componi({ modalita: 'caller', host: '', porta: '' }).stringa, null);
});

test('indirizzo scritto con la porta o con srt://: normalizzato', () => {
  assert.equal(stringa.componi({ modalita: 'caller', host: '203.0.113.10:9000', porta: '' }).stringa, 'srt://203.0.113.10:9000');
  assert.equal(stringa.componi({ modalita: 'caller', host: '203.0.113.10:9000', porta: '9000' }).stringa, 'srt://203.0.113.10:9000');
  assert.equal(stringa.componi({ modalita: 'caller', host: 'srt://203.0.113.10', porta: 9000 }).stringa, 'srt://203.0.113.10:9000');
  assert.equal(stringa.componi({ modalita: 'caller', host: 'SRT://encoder.example.com:9000/?latency=1', porta: '' }).stringa, 'srt://encoder.example.com:9000');
  assert.equal(stringa.componi({ modalita: 'caller', host: '[2001:db8::1]:9000', porta: '' }).stringa, 'srt://[2001:db8::1]:9000');
});

test('indirizzo con una porta diversa dal campo Port, o con spazi: errore', () => {
  assert.ok(codici(stringa.componi({ modalita: 'caller', host: '203.0.113.10:9001', porta: 9000 }).errori).includes('porta'));
  assert.ok(codici(stringa.componi({ modalita: 'caller', host: 'encoder example.com', porta: 9000 }).errori).includes('host-non-valido'));
});

test('passphrase: caratteri invisibili tolti, spazi all\'inizio o alla fine segnalati', () => {
  const r = stringa.componi({ modalita: 'caller', host: '203.0.113.10', porta: 9000, passphrase: 'abcdefghij​' });
  assert.equal(r.stringa, 'srt://203.0.113.10:9000?passphrase=abcdefghij');
  const s = stringa.componi({ modalita: 'caller', host: '203.0.113.10', porta: 9000, passphrase: 'abcdefghij ' });
  assert.ok(codici(s.avvisi).includes('spazi-passphrase'));
  assert.ok(s.stringa.endsWith('passphrase=abcdefghij%20'), 'resta come scritta: lo spazio potrebbe essere voluto');
  assert.deepEqual(stringa.componi({ modalita: 'caller', host: '203.0.113.10', porta: 9000, passphrase: 'abcdefghij' }).avvisi, []);
});
