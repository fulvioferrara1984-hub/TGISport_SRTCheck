// Statistiche dal vivo: dati sintetici nel formato di srt-live-transmit, lettura della tabella e confronto con i
// numeri attesi. Lo script Mac (cartella locale sorgente/, non pubblicata) si prova qui; quello Windows sul workflow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { genera, leggiTabella, numero, confronta } = require('./aiuto-statistiche.js');

const DATI = JSON.parse(fs.readFileSync(path.join(__dirname, 'dati', 'statistiche.json'), 'utf8'));
const caso = (nome) => DATI.find((d) => d.nome === nome);
const MAC = path.join(process.env.SC_SORGENTE || path.join(__dirname, '..', 'sorgente'), 'mac', 'SRT-Check.command');

test('generatore: righe nel formato di srt-live-transmit', () => {
  const righe = genera(caso('pulito').segmenti).trim().split('\n');
  assert.equal(righe.length, 80);
  assert.ok(righe[0].indexOf('"send":{"packets":0') >= 0 && righe[0].indexOf('"send":{"packets":0') < righe[0].indexOf('"recv":{"packets":95'), righe[0]);
  const ultima = JSON.parse(righe[79]);
  assert.equal(ultima.timepoint, '2026-10-25T09:00:19.750000+0100');
  assert.equal(ultima.time, 19750);
  assert.equal(ultima.recv.packets, 7600);
  assert.equal(ultima.recv.bytes, 7600 * 1316);
  assert.deepEqual(Object.keys(ultima), ['sid', 'timepoint', 'time', 'window', 'link', 'send', 'recv']);
  const ric = genera(caso('riconnessione').segmenti).trim().split('\n').map((r) => JSON.parse(r));
  assert.equal(ric.find((r) => r.sid === 202).time, 0);
  const lunga = genera(caso('lunga').segmenti).trim().split('\n');
  assert.equal(JSON.parse(lunga[lunga.length - 1]).timepoint, '2026-10-25T10:59:59.000000+0100');
  const eventi = genera(caso('scartati').segmenti).trim().split('\n').map((r) => JSON.parse(r));
  assert.equal(eventi.find((r) => r.timepoint.startsWith('2026-10-25T09:00:14.000000')).recv.packetsDropped, 3);
});

test('leggiTabella: legge l\'ultima tabella del testo', () => {
  const tabella = (connesso, lost, storico) => [
    'SRT Check - live statistics   (S = back to messages, Ctrl+C = stop)',
    'srt://127.0.0.1:9000  caller',
    'Watching.',
    '',
    `Connected ${connesso}   Latency 200 ms   RTT 4.3 ms   Buffer 198 ms`,
    '',
    '                       last 10 s        total',
    'Bitrate (Mb/s)               4.0          4.0',
    'Packets received           3 800        7 600',
    `Lost                          ${lost}          340`,
    'Retransmitted                 12          356',
    'Dropped (too late)             0            2',
    'Reconnections                               1',
    '',
    `Last 60 s  ${storico}`,
    '           . clean   - = # lost but recovered   X dropped',
    '',
    'Losses recovered: retransmission is keeping up',
    'Last dropped packets: 09:42:13 (2)',
  ].join('\n');
  const t = leggiTabella(tabella('00:00:01', ' 0', '.'.repeat(60)) + '\n' + tabella('00:12:45', '12', ' '.repeat(20) + '.'.repeat(30)));
  assert.equal(t.connesso, '00:12:45');
  assert.equal(t.latenza, '200');
  assert.equal(t.rtt, '4.3');
  assert.equal(t.buffer, '198');
  assert.deepEqual(t.righe.Lost, ['12', '340']);
  assert.deepEqual(t.righe['Packets received'], ['3 800', '7 600']);
  assert.deepEqual(t.righe.Reconnections, ['1']);
  assert.equal(t.storico.length, 60);
  assert.equal(t.storico, ' '.repeat(20) + '.'.repeat(30) + ' '.repeat(10));
  assert.equal(t.stato, 'Losses recovered: retransmission is keeping up');
  assert.equal(t.ultimoScarto, 'Last dropped packets: 09:42:13 (2)');
  assert.equal(t.ultimoMessaggio, null);
  assert.equal(numero('2 736 000'), 2736000);
  assert.deepEqual(confronta(t, { connesso: '00:12:45', persi: ['12', '340'] }), []);
  assert.equal(confronta(t, { persi: ['13', '340'] }).length, 1);
});

test('Mac: stessi numeri attesi per ogni file sintetico', { skip: !fs.existsSync(MAC) }, () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'srt-check-tabella-'));
  try {
    for (const d of DATI) {
      const file = path.join(cartella, d.nome + '.jsonl');
      fs.writeFileSync(file, genera(d.segmenti));
      const inizio = Date.now();
      const r = spawnSync('bash', [MAC, '--stats-table', file].concat(d.at ? ['--at', d.at] : []), { encoding: 'utf8', timeout: 30000 });
      const durata = Date.now() - inizio;
      assert.equal(r.status, 0, `${d.nome}: ${r.stderr || r.stdout}`);
      assert.deepEqual(confronta(leggiTabella(r.stdout), d.atteso), [], `${d.nome}:\n${r.stdout}`);
      if (d.nome === 'lunga') assert.ok(durata < 5000, `lunga: ${durata} ms`);
    }
  } finally {
    fs.rmSync(cartella, { recursive: true, force: true });
  }
});
