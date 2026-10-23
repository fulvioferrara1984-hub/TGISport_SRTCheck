// Conversione della stringa FFmpeg → srt-live-transmit fatta dallo script Mac (--convert-only).
// Lo script è nella cartella locale sorgente/ (non pubblicata): se manca, il test viene saltato.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'sorgente', 'mac', 'SRT-Check.command');
const presente = fs.existsSync(SCRIPT);

// Coppie usate anche dalla prova dello script Windows (stessa tabella di conversione).
const CASI = require('./dati/conversioni.json');

test('conversione per srt-live-transmit', { skip: !presente }, () => {
  for (const [ffmpeg, slt] of CASI) {
    const r = spawnSync('/bin/bash', [SCRIPT, '--convert-only', ffmpeg], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), slt, ffmpeg);
  }
});

