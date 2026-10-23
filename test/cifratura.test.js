// Cifratura (app/cifratura.js) con una password di prova.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const cifratura = require('../app/cifratura.js');

const PASSWORD = 'prova-' + Math.random().toString(36).slice(2);
const ITER = 1000; // poche iterazioni: il test deve essere veloce

test('protezione nuova: chiave giusta valida, chiave sbagliata no', async () => {
  const { protezione, chiave } = await cifratura.nuovaProtezione(PASSWORD, ITER);
  assert.equal(protezione.v, 1);
  assert.equal(protezione.iterazioni, ITER);
  assert.equal(await cifratura.chiaveValida(chiave, protezione), true);
  const sbagliata = await cifratura.derivaChiave(PASSWORD + 'x', protezione.sale, protezione.iterazioni);
  assert.equal(await cifratura.chiaveValida(sbagliata, protezione), false);
});

test('di default 600000 iterazioni, come Playlist Check', async () => {
  assert.equal(cifratura.ITERAZIONI, 600000);
  const { protezione } = await cifratura.nuovaProtezione(PASSWORD);
  assert.equal(protezione.iterazioni, 600000);
});

test('testo cifrato e decifrato', async () => {
  const { chiave } = await cifratura.nuovaProtezione(PASSWORD, ITER);
  const pacchetto = await cifratura.cifraTesto(chiave, '<h2>Guide</h2> è');
  assert.equal(await cifratura.decifraTesto(chiave, pacchetto), '<h2>Guide</h2> è');
});

test('byte cifrati e decifrati, anche 3 MB', async () => {
  const { chiave } = await cifratura.nuovaProtezione(PASSWORD, ITER);
  const dati = new Uint8Array(randomBytes(3 * 1024 * 1024));
  const pacchetto = await cifratura.cifraBytes(chiave, dati);
  assert.equal(typeof pacchetto.iv, 'string');
  assert.equal(typeof pacchetto.ct, 'string');
  const indietro = await cifratura.decifraBytes(chiave, pacchetto);
  assert.ok(indietro instanceof Uint8Array);
  assert.equal(Buffer.compare(Buffer.from(indietro), Buffer.from(dati)), 0);
});

test('byte con la chiave sbagliata: errore', async () => {
  const { chiave, protezione } = await cifratura.nuovaProtezione(PASSWORD, ITER);
  const pacchetto = await cifratura.cifraBytes(chiave, new Uint8Array([1, 2, 3]));
  const sbagliata = await cifratura.derivaChiave('altra-password', protezione.sale, ITER);
  await assert.rejects(cifratura.decifraBytes(sbagliata, pacchetto));
});
