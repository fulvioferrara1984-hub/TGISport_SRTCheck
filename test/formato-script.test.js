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
  'srt_streamid', 'smoother', 'congestion', 'timeout', 'listen_timeout', 'ffs', 'fc', 'tsbpd', 'tsbpdmode', 'send_buffer_size', 'recv_buffer_size'];

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

test('SRT-Check.ps1: FFmpeg dal pacchetto essentials in zip (la build full esiste solo in 7z), con ripiego su GitHub', { skip: !presenti }, () => {
  const t = fs.readFileSync(PS1, 'utf8');
  assert.ok(!t.includes('ffmpeg-release-full.zip'), 'il link full.zip dà 404 (provato da un PC Windows vero)');
  assert.ok(t.includes('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'));
  assert.ok(t.includes('api.github.com/repos/GyanD/codexffmpeg/releases/latest') && t.includes('essentials_build.zip'), 'ripiego sul mirror ufficiale di gyan su GitHub');
  assert.ok(/Test-SrtSupport \$candidateFfmpeg/.test(t), 'la build scaricata deve avere SRT prima di installarla');
  const guida = fs.readFileSync(path.join(SORGENTE, 'guida.html'), 'utf8');
  assert.ok(!guida.includes('200 MB') && guida.includes('110 MB'), 'dimensione del download aggiornata nella guida');
});

test('SRT-Check.ps1: niente -t per srt-live-transmit (su Windows non è implementato): la durata la conta lo script', { skip: !presenti }, () => {
  const t = fs.readFileSync(PS1, 'utf8');
  const argomenti = t.split('\n').find((r) => r.includes('$psi.Arguments ='));
  assert.ok(argomenti && !/-t:/.test(argomenti), argomenti);
  assert.ok(/TotalSeconds -ge \$Seconds\)\s*\{\s*\$reason = 'time'/.test(t), 'allo scadere lo script chiude il test con motivo time');
});

test('finestra 960×540 e registrazione con ffplay che segue il file, nei due script', { skip: !presenti }, () => {
  for (const f of [MAC, PS1]) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(t.includes('-x 960 -y 540') || t.includes("'-x', '960', '-y', '540'"), `${path.basename(f)}: finestra 960×540`);
    assert.ok(t.includes('-follow') && t.includes('Watch and record'), `${path.basename(f)}: registrazione`);
    assert.ok(t.includes('SRT-recording-') && t.includes('Recording saved:'), `${path.basename(f)}: file e messaggio`);
  }
});

test('guida: Watch and record, file della registrazione, attesa di 5 secondi', { skip: !presenti }, () => {
  const t = fs.readFileSync(path.join(SORGENTE, 'guida.html'), 'utf8');
  assert.ok(t.includes('Watch and record') && t.includes('SRT-recording-') && t.includes('about 5 seconds'));
});

test('workflow: azione esterna fissata a uno SHA', () => {
  const t = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'windows.yml'), 'utf8');
  assert.ok(!t.includes('ilammy/msvc-dev-cmd@v1'));
  assert.ok(t.includes('ilammy/msvc-dev-cmd@0b201ec74fa43914dc39ae48a89fd1d8cb592756'));
});
