// Grafici SVG della scheda Statistics (app/grafici.js): testo SVG senza librerie esterne.
const test = require('node:test');
const assert = require('node:assert/strict');
const grafici = require('../app/grafici.js');

const T0 = Date.parse('2026-10-23T12:00:00Z');
const punti = (n, f) => Array.from({ length: n }, (_, i) => [T0 + i * 1000, f(i)]);

test('una serie di 120 punti: una polyline con 120 coppie', () => {
  const svg = grafici.svg({ serie: [{ nome: 'Bitrate', punti: punti(120, (i) => 4 + (i % 3) / 10), classe: 'bitrate' }], unita: 'Mb/s' });
  assert.ok(svg.startsWith('<svg'));
  const poly = svg.match(/<polyline[^>]*points="([^"]*)"/g);
  assert.equal(poly.length, 1);
  const coppie = poly[0].match(/points="([^"]*)"/)[1].trim().split(/\s+/);
  assert.equal(coppie.length, 120);
  assert.ok(coppie.every((c) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(c)), coppie[0]);
  assert.ok(svg.includes('class="serie bitrate"'));
});

test('segni delle cadute: una linea verticale con classe segno', () => {
  const svg = grafici.svg({ serie: [{ nome: 'RTT', punti: punti(60, () => 30), classe: 'rtt' }], unita: 'ms', segni: [T0 + 30000] });
  assert.equal((svg.match(/class="segno"/g) || []).length, 1);
});

test('serie vuota: il testo No data', () => {
  assert.ok(grafici.svg({ serie: [{ nome: 'RTT', punti: [], classe: 'rtt' }], unita: 'ms' }).includes('No data'));
  assert.ok(grafici.svg({ serie: [], unita: 'ms' }).includes('No data'));
});

test('valori tutti uguali o tutti zero: niente NaN né Infinity', () => {
  for (const v of [0, 5]) {
    const svg = grafici.svg({ serie: [{ nome: 'X', punti: punti(30, () => v), classe: 'x' }], unita: '' });
    assert.ok(!/NaN|Infinity/.test(svg), svg.slice(0, 200));
  }
  const unPunto = grafici.svg({ serie: [{ nome: 'X', punti: [[T0, 3]], classe: 'x' }], unita: '' });
  assert.ok(!/NaN|Infinity/.test(unPunto));
});

test('barre: un rettangolo per ogni punto diverso da zero', () => {
  const svg = grafici.svg({ serie: [{ nome: 'Lost', punti: punti(10, (i) => (i === 3 || i === 7 ? 5 : 0)), classe: 'persi' }], unita: 'packets', barre: true });
  assert.equal((svg.match(/<rect[^>]*class="barra persi"/g) || []).length, 2);
});

test('linea di riferimento con etichetta, testi protetti', () => {
  const svg = grafici.svg({ serie: [{ nome: '<b>', punti: punti(10, () => 100), classe: 'buffer' }], unita: 'ms', linee: [{ valore: 200, etichetta: 'Latency 200 ms & more' }] });
  assert.ok(svg.includes('class="linea-rif"'));
  assert.ok(svg.includes('Latency 200 ms &amp; more'));
  assert.ok(!svg.includes('<b>'));
});

test('buco nei dati: la linea si interrompe invece di attraversarlo', () => {
  const p = [...punti(30, () => 30), ...punti(60, () => 30).slice(40)];
  const svg = grafici.svg({ serie: [{ nome: 'RTT', punti: p, classe: 'rtt' }], unita: 'ms' });
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
});

test('etichette dell\'asse tonde: 0, metà e massimo', () => {
  const svg = grafici.svg({ serie: [{ nome: 'Lost', punti: punti(10, (i) => (i === 3 ? 1595 : 0)), classe: 'scartati' }], unita: 'packets', barre: true });
  const etichette = [...svg.matchAll(/<text class="asse" x="40"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(etichette, ['0', '1000', '2000']);
});
