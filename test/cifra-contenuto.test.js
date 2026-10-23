// Strumento di pacchettizzazione e cifratura (strumenti/cifra-contenuto.mjs), su una sorgente finta.
// Lo strumento è locale (non pubblicato): se manca, il test viene saltato.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const cifratura = require('../app/cifratura.js');

const STRUMENTO = path.join(__dirname, '..', 'strumenti', 'cifra-contenuto.mjs');
const presente = fs.existsSync(STRUMENTO);
const PASSWORD = 'prova-password-123';

function preparaSorgente() {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'srt-check-'));
  const sorgente = path.join(cartella, 'sorgente');
  fs.mkdirSync(path.join(sorgente, 'mac'), { recursive: true });
  fs.mkdirSync(path.join(sorgente, 'windows', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(sorgente, 'guida.html'), '<h2>Quick start</h2>\n');
  fs.writeFileSync(path.join(sorgente, 'mac', 'SRT-Check.command'), '#!/bin/bash\necho ok\n', { mode: 0o755 });
  fs.writeFileSync(path.join(sorgente, 'windows', 'SRT-Check.bat'), '@echo off\r\n');
  fs.writeFileSync(path.join(sorgente, 'windows', 'SRT-Check.ps1'), 'Write-Host ok\r\n');
  fs.writeFileSync(path.join(sorgente, 'windows', 'bin', 'LICENSE-SRT.txt'), 'MPL-2.0\n');
  const filePassword = path.join(cartella, 'segreto-prova.txt');
  fs.writeFileSync(filePassword, `# commento: la riga sotto è la password\n${PASSWORD}\n`);
  return { cartella, sorgente, filePassword, uscita: path.join(cartella, 'uscita') };
}

function esegui(argomenti) {
  return spawnSync(process.execPath, [STRUMENTO, ...argomenti], { encoding: 'utf8' });
}

function caricaGlobale(file, nome) {
  const contesto = { self: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), contesto);
  return contesto.self[nome];
}

test('guida e pacchetti cifrati con la stessa protezione e la password giusta', { skip: !presente }, async () => {
  const p = preparaSorgente();
  const r = esegui(['--password', p.filePassword, '--sorgente', p.sorgente, '--uscita', p.uscita]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes(PASSWORD) && !r.stderr.includes(PASSWORD), 'la password non va mai stampata');

  const guida = caricaGlobale(path.join(p.uscita, 'guida.js'), 'SC_GUIDA');
  const pacchetti = caricaGlobale(path.join(p.uscita, 'pacchetti.js'), 'SC_PACCHETTI');
  assert.equal(guida.protezione.sale, pacchetti.protezione.sale);
  assert.deepEqual({ ...pacchetti.nomi }, { mac: 'SRT-Check-Mac.zip', windows: 'SRT-Check-Windows.zip' });

  const chiave = await cifratura.derivaChiave(PASSWORD, guida.protezione.sale, guida.protezione.iterazioni);
  assert.equal(await cifratura.chiaveValida(chiave, guida.protezione), true);
  assert.equal(await cifratura.decifraTesto(chiave, guida.dati), '<h2>Quick start</h2>\n');

  for (const sistema of ['mac', 'windows']) {
    const zip = Buffer.from(await cifratura.decifraBytes(chiave, pacchetti[sistema]));
    assert.equal(createHash('sha256').update(zip).digest('hex'), pacchetti.sha256[sistema]);
    assert.ok(r.stdout.includes(pacchetti.sha256[sistema]), 'lo SHA-256 viene stampato');
    fs.writeFileSync(path.join(p.cartella, `${sistema}.zip`), zip);
  }

  const estratto = path.join(p.cartella, 'estratto-mac');
  execFileSync('ditto', ['-x', '-k', path.join(p.cartella, 'mac.zip'), estratto]);
  const comando = path.join(estratto, 'SRT Check', 'SRT-Check.command');
  assert.ok(fs.statSync(comando).mode & 0o111, 'lo script Mac resta eseguibile');

  const estrattoWin = path.join(p.cartella, 'estratto-win');
  execFileSync('ditto', ['-x', '-k', path.join(p.cartella, 'windows.zip'), estrattoWin]);
  assert.ok(fs.existsSync(path.join(estrattoWin, 'SRT Check', 'SRT-Check.ps1')));
  assert.ok(fs.existsSync(path.join(estrattoWin, 'SRT Check', 'bin', 'LICENSE-SRT.txt')));
});

test('password sotto gli 8 caratteri: si ferma con codice 1', { skip: !presente }, () => {
  const p = preparaSorgente();
  fs.writeFileSync(p.filePassword, '# commento\nxq7zk\n');
  const r = esegui(['--password', p.filePassword, '--sorgente', p.sorgente, '--uscita', p.uscita]);
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes('xq7zk') && !r.stderr.includes('xq7zk'));
  assert.ok(!fs.existsSync(path.join(p.uscita, 'guida.js')));
});

test('ricifrare con la stessa password tiene lo stesso sale: "Remember on this device" resta valido', { skip: !presente }, () => {
  const p = preparaSorgente();
  const argomenti = ['--password', p.filePassword, '--sorgente', p.sorgente, '--uscita', p.uscita];
  assert.equal(esegui(argomenti).status, 0);
  const prima = caricaGlobale(path.join(p.uscita, 'guida.js'), 'SC_GUIDA');
  fs.writeFileSync(path.join(p.sorgente, 'guida.html'), '<h2>Quick start v2</h2>\n');
  assert.equal(esegui(argomenti).status, 0);
  const dopo = caricaGlobale(path.join(p.uscita, 'guida.js'), 'SC_GUIDA');
  assert.equal(dopo.protezione.sale, prima.protezione.sale);
  assert.notEqual(dopo.dati.iv, prima.dati.iv, 'ogni cifratura usa un IV nuovo');
  assert.equal(caricaGlobale(path.join(p.uscita, 'pacchetti.js'), 'SC_PACCHETTI').protezione.sale, prima.protezione.sale);

  fs.writeFileSync(p.filePassword, '# un\'altra password\naltra-password-456\n');
  assert.equal(esegui(argomenti).status, 0);
  assert.notEqual(caricaGlobale(path.join(p.uscita, 'guida.js'), 'SC_GUIDA').protezione.sale, prima.protezione.sale, 'password cambiata: protezione nuova');
});

test('gli zip non contengono i file ._ del Mac (attributi estesi), che su Windows comparirebbero accanto agli script', { skip: !presente }, async () => {
  const p = preparaSorgente();
  for (const f of ['mac/SRT-Check.command', 'windows/SRT-Check.bat', 'windows/bin/LICENSE-SRT.txt']) {
    execFileSync('xattr', ['-w', 'it.srtcheck.prova', '1', path.join(p.sorgente, f)]);
  }
  assert.equal(esegui(['--password', p.filePassword, '--sorgente', p.sorgente, '--uscita', p.uscita]).status, 0);
  const pacchetti = caricaGlobale(path.join(p.uscita, 'pacchetti.js'), 'SC_PACCHETTI');
  const chiave = await cifratura.derivaChiave(PASSWORD, pacchetti.protezione.sale, pacchetti.protezione.iterazioni);
  for (const sistema of ['mac', 'windows']) {
    const zip = path.join(p.cartella, `${sistema}-x.zip`);
    fs.writeFileSync(zip, Buffer.from(await cifratura.decifraBytes(chiave, pacchetti[sistema])));
    const voci = execFileSync('zipinfo', ['-1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
    assert.ok(voci.length > 0);
    assert.deepEqual(voci.filter((v) => /(^|\/)\._|__MACOSX/.test(v)), [], `${sistema}: ${voci.join(', ')}`);
  }
  const estratto = path.join(p.cartella, 'estratto-x');
  execFileSync('ditto', ['-x', '-k', path.join(p.cartella, 'mac-x.zip'), estratto]);
  assert.ok(fs.statSync(path.join(estratto, 'SRT Check', 'SRT-Check.command')).mode & 0o111, 'lo script Mac resta eseguibile');
});
