// Lettura e analisi dei report di stabilità (app/report.js) su report sintetici.
const test = require('node:test');
const assert = require('node:assert/strict');
const report = require('../app/report.js');
const { creaReport } = require('./aiuto-report.js');

const analizza = (opzioni) => report.analizza(report.leggi(creaReport(opzioni).testo));
const codici = (a) => a.frasi.map((f) => f.codice);
const frase = (a, codice) => a.frasi.find((f) => f.codice === codice);

test('leggi: contatori cumulativi trasformati in differenze, connessioni per sid', () => {
  const r = report.leggi(creaReport({ durataS: 10, mbit: 4 }).testo);
  assert.equal(r.intestazione.formato, 'srt-check-report');
  assert.equal(r.connessioni.length, 1);
  const c = r.connessioni[0].campioni;
  assert.equal(c.length, 10);
  assert.equal(c[0].unici, 380);
  assert.equal(c[5].unici, 380, 'ogni campione ha i pacchetti del suo intervallo, non il totale');
  assert.equal(r.fine.motivo, 'time');
  assert.deepEqual(r.avvertenze, []);
});

test('leggi: ora di srt-live-transmit (microsecondi, fuso +0200) e di PowerShell (7 decimali, +02:00)', () => {
  assert.equal(report.leggiOra('2026-10-23T13:56:41.420624+0200'), Date.parse('2026-10-23T11:56:41.420Z'));
  assert.equal(report.leggiOra('2026-10-23T13:56:41.4206241+02:00'), Date.parse('2026-10-23T11:56:41.420Z'));
  assert.equal(report.leggiOra('2026-10-23T11:56:41Z'), Date.parse('2026-10-23T11:56:41Z'));
  assert.equal(report.leggiOra('ieri'), null);
});

test('leggi: un file che non è un report', () => {
  assert.throws(() => report.leggi('{"a":1}\n'), /not-a-report/);
  assert.throws(() => report.leggi('ciao'), /not-a-report/);
});

test('pulito: stabile, tutto pulito, collegato per tutto il test', () => {
  const a = analizza({ durataS: 300, mbit: 4, rtt: 30 });
  assert.equal(a.giudizio, 'stable');
  assert.deepEqual(codici(a), ['tutto-pulito']);
  assert.ok(Math.abs(a.misure.collegatoS - 300) <= 1, String(a.misure.collegatoS));
  assert.equal(a.misure.cadute.length, 0);
  assert.equal(a.misure.persiDefinitivi, 0);
  assert.ok(Math.abs(a.misure.bitrate.medio - 4) < 0.01);
  assert.equal(a.misure.rtt.mediana, 30);
  assert.equal(a.misure.latenzaUsataMs, 200);
  assert.ok(a.serie.length >= 299 && a.serie.length <= 301);
});

test('perdita-3: stabile, perdite recuperate', () => {
  const a = analizza({ perditaPct: 3, latenzaMs: 200 });
  assert.equal(a.giudizio, 'stable');
  assert.ok(codici(a).includes('perdita-recuperata'));
  assert.ok(Math.abs(a.misure.perditaPct - 3) < 0.2, String(a.misure.perditaPct));
  assert.ok(a.misure.recuperati > 0);
  assert.equal(a.misure.persiDefinitivi, 0);
  assert.equal(report.latenzaConsigliata(3, 30), 120);
});

test('scartati: instabile, persi definitivamente con gli orari', () => {
  const r = report.leggi(creaReport({ scartatiAl: [120, 200] }).testo);
  const a = report.analizza(r);
  assert.equal(a.giudizio, 'unstable');
  const f = frase(a, 'persi-definitivi');
  assert.ok(f && f.livello === 'error');
  const campioni = r.connessioni[0].campioni;
  for (const s of [120, 200]) assert.ok(f.testo.includes(report.ora(campioni[s - 1].ora)), f.testo);
  assert.equal(a.misure.persiDefinitivi, 10);
});

test('cadute: nuovo sid dopo 5 s, una caduta', () => {
  const a = analizza({ cadute: [{ dopoS: 100, perS: 5 }] });
  assert.equal(a.giudizio, 'unstable');
  assert.ok(codici(a).includes('cadute'));
  assert.equal(a.misure.cadute.length, 1);
  assert.ok(Math.abs(a.misure.cadute[0].durataS - 5) <= 1.5, String(a.misure.cadute[0].durataS));
  assert.ok(a.misure.collegatoS < 297);
});

test('cadute: una sola caduta anche senza righe evento (solo cambio di sid)', () => {
  const a = analizza({ cadute: [{ dopoS: 100, perS: 5 }], eventi: false });
  assert.equal(a.misure.cadute.length, 1);
});

test('campioni-radi: 0,5 Mb/s con un campione ogni 2,5 s non sono cadute', () => {
  const a = analizza({ mbit: 0.5, intervalloS: 2.5 });
  assert.equal(a.giudizio, 'stable');
  assert.equal(a.misure.cadute.length, 0);
  assert.equal(a.misure.sorgenteFerma.length, 0);
});

test('sorgente-ferma: nessuna riga per 6 s, collegamento attivo, nessuna perdita dopo', () => {
  const a = analizza({ buchi: [{ dopoS: 150, perS: 6 }] });
  assert.equal(a.giudizio, 'unstable');
  assert.ok(codici(a).includes('sorgente-ferma'));
  assert.equal(a.misure.cadute.length, 0);
  assert.equal(a.misure.sorgenteFerma.length, 1);
});

test('sorgente-ferma: righe con zero pacchetti per 6 s', () => {
  const a = analizza({ zeroDa: { dopoS: 150, perS: 6 } });
  assert.ok(codici(a).includes('sorgente-ferma'));
});

test('buco seguito da perdite: è un\'interruzione di rete, non la sorgente', () => {
  const a = analizza({ buchi: [{ dopoS: 150, perS: 4, conPerdite: true }] });
  assert.equal(a.giudizio, 'unstable');
  assert.ok(!codici(a).includes('sorgente-ferma'));
  assert.ok(codici(a).includes('cadute'));
  assert.ok(codici(a).includes('persi-definitivi'));
});

test('rtt-irregolare: mediana 30, picchi 90', () => {
  assert.ok(codici(analizza({ rtt: 30, rttPicchi: 90 })).includes('rtt-irregolare'));
  assert.ok(!codici(analizza({ rtt: 0.1, rttPicchi: 0.3 })).includes('rtt-irregolare'), 'in loopback le variazioni sono minime');
});

test('report-senza-fine: si analizza lo stesso', () => {
  const r = report.leggi(creaReport({ senzaFine: true }).testo);
  assert.ok(r.avvertenze.includes('incomplete'));
  assert.equal(report.analizza(r).giudizio, 'stable');
});

test('non funziona: mai collegato, oppure collegato senza dati', () => {
  const mai = analizza({ senzaCampioni: true });
  assert.equal(mai.giudizio, 'not-working');
  assert.deepEqual(codici(mai), ['non-funziona-mai-collegato']);
  const vuoto = analizza({ senzaDati: true });
  assert.equal(vuoto.giudizio, 'not-working');
  assert.deepEqual(codici(vuoto), ['non-funziona-senza-dati']);
});

test('latenza sotto quella consigliata: consiglio anche se stabile', () => {
  const a = analizza({ rtt: 60, latenzaMs: 100 });
  assert.equal(a.giudizio, 'stable');
  assert.ok(codici(a).includes('latenza-sotto-consigliata'));
  assert.equal(a.latenzaConsigliataMs, 180);
});

test('tabella Haivision', () => {
  assert.equal(report.latenzaConsigliata(0.5, 10), 60);
  assert.equal(report.latenzaConsigliata(5, 50), 300);
  assert.equal(report.latenzaConsigliata(10, 30), 240);
  assert.equal(report.latenzaConsigliata(45, 30), null);
  assert.equal(report.latenzaConsigliata(0, 33), 100, 'arrotondata ai 10 ms superiori');
});

test('ogni frase ha titolo, testo e azione', () => {
  const casi = [{}, { perditaPct: 3 }, { scartatiAl: [10] }, { cadute: [{ dopoS: 50, perS: 5 }] }, { buchi: [{ dopoS: 50, perS: 6 }] },
    { rtt: 30, rttPicchi: 90 }, { senzaCampioni: true }, { senzaDati: true }, { rtt: 60, latenzaMs: 100 }, { perditaPct: 12 }];
  for (const c of casi) {
    for (const f of analizza(c).frasi) {
      assert.ok(['ok', 'info', 'warning', 'error'].includes(f.livello), f.codice);
      assert.ok(f.titolo && f.testo && typeof f.azione === 'string', f.codice);
    }
  }
  assert.ok(codici(analizza({ perditaPct: 12 })).includes('perdita-alta'));
});

test('bitrate per intervallo: mbitRate di -f è una media, una sosta a zero deve portare il minimo a 0', () => {
  const a = analizza({ zeroDa: { dopoS: 150, perS: 6 } });
  assert.equal(a.misure.bitrate.min, 0);
  assert.ok(Math.abs(a.misure.bitrate.max - 4) < 0.05, String(a.misure.bitrate.max));
  assert.ok(a.serie.some((p) => p.mbit === 0), 'nel grafico la sosta è a zero');
  assert.ok(Math.abs(analizza({}).misure.bitrate.medio - 4) < 0.05);
});

test('sorgente ferma fino alla fine: righe fino a 30 s, fine a 60 s', () => {
  const a = analizza({ durataS: 60, righeFinoA: 30, eventi: false });
  assert.equal(a.giudizio, 'unstable');
  assert.ok(codici(a).includes('sorgente-ferma'), codici(a).join());
  assert.ok(a.misure.collegatoS >= 55, String(a.misure.collegatoS));
});

test('fine normale: 2 s fra l\'ultima riga e la fine non sono una sosta', () => {
  const a = analizza({ durataS: 60, righeFinoA: 58 });
  assert.equal(a.giudizio, 'stable');
  assert.equal(a.misure.sorgenteFerma.length, 0);
});

test('caduta senza ritorno a 30 s di un test di 60 s: collegato circa 30 s', () => {
  const a = analizza({ durataS: 60, cadute: [{ dopoS: 30, perS: 1000 }] });
  assert.equal(a.giudizio, 'unstable');
  assert.equal(a.misure.cadute.length, 1);
  assert.ok(a.misure.collegatoS >= 28 && a.misure.collegatoS <= 32, String(a.misure.collegatoS));
  assert.ok(Math.abs(a.misure.cadute[0].durataS - 30) <= 2, String(a.misure.cadute[0].durataS));
});

test('perdita oltre il 40%: collegamento inutilizzabile, nessun consiglio fuorviante', () => {
  const a = analizza({ perditaPct: 45, scartatiAl: [10] });
  assert.equal(a.latenzaConsigliataMs, null);
  const f = frase(a, 'rete-inutilizzabile');
  assert.ok(f && f.livello === 'error');
  assert.ok(!frase(a, 'persi-definitivi').azione.includes('already matches'), frase(a, 'persi-definitivi').azione);
});
