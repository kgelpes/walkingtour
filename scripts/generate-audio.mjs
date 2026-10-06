#!/usr/bin/env node
// Generates narration MP3s for every tour with ElevenLabs.
//
//   ELEVENLABS_API_KEY=... npm run audio            # all tours
//   ELEVENLABS_API_KEY=... npm run audio -- kiyomizu-dera
//   npm run audio -- --force                        # regenerate even if unchanged
//   npm run audio -- --remaster                     # re-level the existing clips, no API calls
//
// Clips are levelled to podcast loudness (LOUDNESS below) with ffmpeg, so a
// story is clearly audible over the listener's own (lowered) music.
//
// Each clip is named <id>.<hash>.mp3 where the hash covers the text, voice and
// model, so unchanged clips are skipped (no API spend) and edited clips get a
// new URL (no stale service-worker cache). The resulting file name and duration
// are written back into tour.json. The API key is never written anywhere.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TOURS = join(ROOT, 'public/tours');
const FORMAT = 'mp3_44100_96';
const BITRATE = 96_000;
// Apple's podcast spec. ElevenLabs returns about -24 to -31 LUFS, far quieter than music (-14).
const LOUDNESS = { I: -16, TP: -1.5, LRA: 11 };

loadDotEnv();
const args = process.argv.slice(2);
const force = args.includes('--force');
const remaster = args.includes('--remaster');
const only = args.filter((a) => !a.startsWith('--'));
const key = process.env.ELEVENLABS_API_KEY;

function loadDotEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

// Macrons help readers but trip up TTS; speak the plain romanisation.
function forSpeech(text) {
  return text
    .normalize('NFD')
    .replace(/[̄]/g, '')
    .normalize('NFC')
    .replace(/[“”]/g, '"');
}

async function tts(voice, text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=${FORMAT}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: voice.model,
        voice_settings: voice.settings ?? { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text();
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** Two-pass EBU R128 loudness normalisation; returns the levelled MP3. */
function normalise(path) {
  const ff = (...a) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, ...a], { maxBuffer: 64 << 20 });
    if (r.error?.code === 'ENOENT') throw new Error('ffmpeg is needed to level the narration (brew install ffmpeg / apt install ffmpeg).');
    if (r.status !== 0) throw new Error(`ffmpeg failed on ${path}: ${r.stderr.toString().slice(-300)}`);
    return r;
  };
  const target = `I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`;
  const log = ff('-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-').stderr.toString();
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  return ff('-af', `loudnorm=${target}:${measured}`, '-ar', '44100', '-ac', '1', '-b:a', String(BITRATE), '-f', 'mp3', '-').stdout;
}

async function processTour(id) {
  const dir = join(TOURS, id);
  const file = join(dir, 'tour.json');
  const tour = JSON.parse(readFileSync(file, 'utf8'));
  const clips = [tour.intro, ...tour.stops].filter(Boolean);
  const keep = new Set();
  let generated = 0;

  for (const clip of clips) {
    const text = forSpeech(clip.text);
    const hash = createHash('sha256')
      .update(JSON.stringify([text, tour.voice.voiceId, tour.voice.model, tour.voice.settings ?? null, FORMAT, LOUDNESS]))
      .digest('hex')
      .slice(0, 10);
    const name = `audio/${clip.id}.${hash}.mp3`;
    const path = join(dir, name);
    keep.add(name);
    if (!force && existsSync(path) && clip.audio === name) continue;
    const old = clip.audio && join(dir, clip.audio);
    if (remaster && old && existsSync(old)) {
      process.stdout.write(`  ${id}/${clip.id} (re-levelling)… `);
    } else {
      if (!key) throw new Error(`Clip "${clip.id}" in ${id} needs (re)generating but ELEVENLABS_API_KEY is not set.`);
      process.stdout.write(`  ${id}/${clip.id} (${text.length} chars)… `);
      writeFileSync(path, await tts(tour.voice, text));
    }
    const mp3 = normalise(remaster && old && existsSync(old) ? old : path);
    writeFileSync(path, mp3);
    clip.audio = name;
    clip.duration = Math.round((mp3.length * 8) / BITRATE);
    generated++;
    console.log(`${(mp3.length / 1024).toFixed(0)} KB, ${clip.duration}s`);
  }

  for (const f of readdirSync(join(dir, 'audio'))) {
    if (!keep.has(`audio/${f}`)) unlinkSync(join(dir, 'audio', f));
  }
  writeFileSync(file, JSON.stringify(tour, null, 2) + '\n');
  console.log(`${id}: ${generated} generated, ${clips.length - generated} unchanged`);
}

const ids = only.length ? only : readdirSync(TOURS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const id of ids) await processTour(id);
