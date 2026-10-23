// Formato degli script degli strumenti (cartella locale sorgente/, non pubblicata: se manca, il test viene saltato).
// Windows PowerShell 5.1 legge male i .ps1 non ASCII senza BOM; cmd vuole i .bat con CRLF; bash vuole LF.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SORGENTE = process.env.SC_SORGENTE || path.join(__dirname, '..', 'sorgente');
const PS1 = path.join(SORGENTE, 'windows', 'SRT-Check.ps1');
const BAT = path.join(SORGENTE, 'windows', 'SRT-Check.bat');
const MAC = path.join(SORGENTE, 'mac', 'SRT-Check.command');
const presenti = [PS1, BAT, MAC].every((f) => fs.existsSync(f));

// Nomi della conversione FFmpeg → srt-live-transmit che devono comparire in entrambi gli script.
const CONVERSIONE = ['latency', 'rcvlatency', 'peerlatency', 'snddropdelay', 'tsbpddelay', 'connect_timeout', 'conntimeo',
  'pkt_size', 'payload_size', 'payloadsize', 'ts_size', '1316', 'max_size', '1456', 'enforced_encryption', 'enforcedencryption',
  'srt_streamid', 'smoother', 'congestion', 'timeout', 'listen_timeout'];

test('SRT-Check.ps1: solo caratteri ASCII', { skip: !presenti }, () => {
  const b = fs.readFileSync(PS1);
  const i = b.findIndex((c) => c >= 0x80);
  assert.equal(i, -1, i >= 0 ? `carattere non ASCII vicino a: ${b.subarray(Math.max(0, i - 30), i + 5).toString('latin1')}` : '');
});

test('SRT-Check.bat: fine riga CRLF', { skip: !presenti }, () => {
  const t = fs.readFileSync(BAT, 'latin1');
  assert.ok(t.length > 0);
  assert.ok(!/[^\r]\n/.test(t) && !/^\n/.test(t), 'ogni a capo deve essere CRLF');
  assert.ok(t.includes('"%~dp0SRT-Check.ps1" %*'), 'il .bat inoltra gli argomenti allo script accanto');
});

test('SRT-Check.command: fine riga LF e bash', { skip: !presenti }, () => {
  const t = fs.readFileSync(MAC, 'utf8');
  assert.ok(t.startsWith('#!/bin/bash\n'));
  assert.ok(!t.includes('\r'));
  assert.ok(fs.statSync(MAC).mode & 0o111, 'eseguibile');
});

test('stessa tabella di conversione nei due script', { skip: !presenti }, () => {
  const ps1 = fs.readFileSync(PS1, 'utf8'), mac = fs.readFileSync(MAC, 'utf8');
  for (const nome of CONVERSIONE) {
    assert.ok(ps1.includes(nome), `${nome} manca nello script Windows`);
    assert.ok(mac.includes(nome), `${nome} manca nello script Mac`);
  }
});

test('SRT-Check.bat: se lo script non è accanto (zip non estratto) spiega cosa fare e si ferma', { skip: !presenti }, () => {
  const t = fs.readFileSync(BAT, 'latin1');
  assert.ok(t.includes('if not exist "%~dp0SRT-Check.ps1"'), 'controllo dello script accanto');
  assert.ok(/Extract All/i.test(t), 'spiega di estrarre lo zip');
  assert.ok(/\r\n\s*pause\r\n/i.test(t), 'si ferma per far leggere il messaggio');
});

test('SRT-Check.ps1: chiudendo la finestra niente processi orfani e report già su disco', { skip: !presenti }, () => {
  const t = fs.readFileSync(PS1, 'utf8');
  assert.ok(t.includes('AssignProcessToJobObject') && t.includes('0x2000'), 'job object con KILL_ON_JOB_CLOSE');
  assert.ok(/AggiungiAlJob\(\$slt\)/.test(t) && /AggiungiAlJob\(\$play\)/.test(t), 'srt-live-transmit e ffplay nel job');
  assert.ok(/\[SrtCheck\]::Inizia\(/.test(t), 'il report si apre con l\'intestazione all\'inizio del test');
  assert.ok(/^trap \{/m.test(t), 'errori imprevisti: messaggio e pausa invece della finestra che sparisce');
  assert.ok(/StartsWith\('srt:\/\/'/.test(t), 'stringa che non inizia con srt://: messaggio chiaro');
});

test('avviso di licenza: SRT e OpenSSL', { skip: !presenti }, () => {
  const t = fs.readFileSync(path.join(SORGENTE, 'windows', 'bin', 'LICENSE-SRT.txt'), 'utf8');
  assert.ok(t.includes('MPL-2.0') && /OpenSSL/.test(t) && /Apache/.test(t));
});

test('guida: per Windows il primo passo è estrarre lo zip', { skip: !presenti }, () => {
  const t = fs.readFileSync(path.join(SORGENTE, 'guida.html'), 'utf8');
  const quick = t.slice(t.indexOf('1. Quick start'), t.indexOf('2. First launch on Mac'));
  assert.ok(/Extract All/.test(quick), 'Quick start: Extract All per Windows');
});
