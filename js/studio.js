/* Faceless Video Studio — in-phone Ken Burns film, H.264 MP4. */
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';

const PLACES = [
  'a rain-streaked kitchen window at dusk',
  'an empty wet street under one distant lamp',
  'a foggy shoreline with a vast grey sky',
  'a dim hallway with a single warm doorway',
  'a snow-quiet field under a pale moon',
  'an ocean terrace in charcoal weather',
  'a high window over a sleeping city',
  'an empty train platform in teal fog'
];

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function writeScript(topic, n = 5) {
  const t = String(topic || 'this feeling').trim().replace(/\s+/g, ' ');
  const short = t.replace(/^the psychology of /i, '').replace(/\.$/, '');
  const count = Math.max(4, Math.min(8, Number(n) || 5));
  const beats = [
    `You know this before you have a name for it. ${short}. It lives in the body first — a tightness, a looping thought, a room that never quite goes quiet.`,
    `You replay the same sentence. You check the same door. You call it careful, but it is just the mind trying to keep you safe from a future that has not happened.`,
    `Other people move on. You stay with the echo. Being the one who notices everything is a kind of loneliness you learned to call strength.`,
    `Nothing is wrong, and still you cannot rest. The nervous system does not take weekends. It keeps a light on in an empty house.`,
    `You do not have to solve the whole weather tonight. One slow breath is already a different room.`,
    `There is a version of you that is allowed to be unfinished. Let that person sit by the window a little longer.`,
    `The feeling can stay, and you can still be kind to it. That is not giving up. That is coming home.`,
    `When the loop starts again, name it softly. You are here. The night is wide enough for you and the thought.`
  ];
  const title = short.length > 48 ? short.slice(0, 45) + '…' : (short[0].toUpperCase() + short.slice(1));
  const scenes = [];
  for (let i = 0; i < count; i++) {
    const place = PLACES[i % PLACES.length];
    scenes.push({
      narration: beats[i % beats.length],
      visual: `A small solitary figure at ${place}. No face in sharp detail. Moody teal and charcoal, warm amber accent.`
    });
  }
  scenes[0].narration = `You know this feeling: ${short}. It sits in the body before it has a name.`;
  return { title, scenes };
}

export function sceneDuration(narration) {
  const words = String(narration || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.min(11, words / 2.35 + 1.2));
}

function paintStill(visual, w = 1280, h = 720) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const n = hash32(visual);
  const teal = 160 + (n % 40);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgb(${20 + (n % 18)}, ${28 + (n % 22)}, ${36 + (n % 30)})`);
  g.addColorStop(0.45, `rgb(18, ${24 + (n % 16)}, ${teal / 4})`);
  g.addColorStop(1, `rgb(8, 10, 14)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = `rgba(${teal}, ${180 + (n % 40)}, ${160}, 0.08)`;
  ctx.beginPath();
  ctx.ellipse(w * 0.72, h * 0.18, 280, 160, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(201,163,106,0.16)';
  ctx.beginPath();
  ctx.ellipse(w * 0.22, h * 0.72, 90, 40, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(6,8,10,0.72)';
  ctx.fillRect(0, h * 0.62, w, h * 0.38);

  ctx.fillStyle = '#0d1116';
  const fx = w * (0.38 + ((n >> 8) % 20) / 100);
  const fy = h * 0.58;
  ctx.beginPath();
  ctx.ellipse(fx, fy + 86, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(fx - 10, fy, 20, 80);
  ctx.beginPath();
  ctx.arc(fx, fy - 6, 11, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 180; i++) {
    const x = (hash32(visual + i) % w);
    const y = (hash32(visual + ':' + i) % h);
    ctx.fillStyle = `rgba(255,255,255,${0.015 + (i % 7) / 400})`;
    ctx.fillRect(x, y, 1, 1);
  }
  if (/rain|wet|window/i.test(visual)) {
    ctx.strokeStyle = 'rgba(180,200,210,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = (hash32('r' + i + visual) % w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 8, h);
      ctx.stroke();
    }
  }
  return c;
}

function pickMime() {
  const types = [
    'video/mp4;codecs=avc1.4D001F,mp4a.40.2',
    'video/mp4;codecs=avc1.42001E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4'
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

async function pickVideoCodec(w, h) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') return null;
  const codecs = ['avc1.4D001F', 'avc1.42001E', 'avc1.64001F', 'avc1.42001F'];
  for (const codec of codecs) {
    for (const hw of ['prefer-hardware', 'prefer-software', 'no-preference']) {
      const cfg = { codec, width: w, height: h, bitrate: 2_400_000, framerate: 24, avc: { format: 'avc' }, hardwareAcceleration: hw };
      try {
        const s = await VideoEncoder.isConfigSupported(cfg);
        if (s?.supported) return { mux: 'avc', config: { ...cfg, ...(s.config || {}) } };
      } catch {}
    }
  }
  return null;
}

async function pickAudioCodec(sampleRate) {
  if (typeof AudioEncoder === 'undefined' || typeof AudioEncoder.isConfigSupported !== 'function') return null;
  const opts = [
    { codec: 'mp4a.40.2', mux: 'aac' },
    { codec: 'mp4a.40.02', mux: 'aac' },
    { codec: 'opus', mux: 'opus' }
  ];
  for (const o of opts) {
    const cfg = { codec: o.codec, numberOfChannels: 1, sampleRate, bitrate: o.mux === 'opus' ? 64000 : 96000 };
    try {
      const s = await AudioEncoder.isConfigSupported(cfg);
      if (s?.supported) return { mux: o.mux, config: { ...cfg, ...(s.config || {}) } };
    } catch {}
  }
  return null;
}

async function drainEncoder(enc) {
  while (enc && enc.encodeQueueSize > 6) await wait(4);
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const VOWEL_F = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010],
  o: [570, 840, 2410], u: [300, 870, 2240], y: [300, 1870, 2200]
};

const VOICE_PITCH = { nova: 188, echo: 128, onyx: 98, alloy: 145, shimmer: 200, fable: 160 };

function phonemes(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z']/g, '');
  const out = [];
  for (const c of w) {
    if (VOWEL_F[c]) out.push({ t: 'v', f: VOWEL_F[c] });
    else if ('mnlrw'.includes(c)) out.push({ t: 'n', f: [360, 1100, 2400] });
    else if ('szfthpck'.includes(c)) out.push({ t: 'u' });
    else out.push({ t: 's', f: [480, 1480, 2500] });
  }
  return out.length ? out : [{ t: 'v', f: VOWEL_F.a }];
}

/** Formant narrator baked into the file (speechSynthesis cannot be recorded). */
function synthesizeNarration(ctx, text, duration, pitchHz) {
  const sr = ctx.sampleRate;
  const n = Math.max(Math.floor(duration * sr), sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return buf;
  const units = words.reduce((a, w) => a + phonemes(w).length + 1, 0);
  const glottal = pitchHz || 140;
  let pos = Math.floor(0.08 * sr);
  for (const word of words) {
    const ph = phonemes(word);
    for (const p of ph) {
      const dur = Math.max(0.045, (duration * 0.86 / units) * (p.t === 'v' ? 1.7 : 0.65));
      const len = Math.floor(dur * sr);
      const aAtk = Math.max(1, 0.012 * sr);
      const aRel = Math.max(1, 0.03 * sr);
      for (let i = 0; i < len && pos + i < n; i++) {
        const t = i / sr;
        const env = Math.min(i / aAtk, 1) * Math.min((len - i) / aRel, 1);
        let s = 0;
        if (p.t === 'u') {
          s = (Math.random() * 2 - 1) * 0.1 * env;
        } else {
          const buzz = ((t * glottal) % 1 < 0.18 ? 1 : 0.12) * (0.45 + 0.2 * Math.sin(2 * Math.PI * glottal * t));
          const f = p.f || VOWEL_F.a;
          s = buzz * env * 0.28 * (
            Math.sin(2 * Math.PI * f[0] * t) * 0.62 +
            Math.sin(2 * Math.PI * f[1] * t) * 0.28 +
            Math.sin(2 * Math.PI * f[2] * t) * 0.1
          );
        }
        d[pos + i] += s;
      }
      pos += len;
    }
    pos += Math.floor(0.07 * sr);
  }
  let peak = 0.001;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = 0.78 / peak;
  for (let i = 0; i < n; i++) d[i] *= g;
  return buf;
}

function drawKenBurnsFrame(ctx, still, sc, f, frames, w, h) {
  const t = f / frames;
  const z = 1 + 0.08 * t;
  const ox = Math.sin(f / 40) * 12;
  const oy = Math.cos(f / 35) * 8;
  const sw = still.width / z, sh = still.height / z;
  const sx = (still.width - sw) / 2 + ox;
  const sy = (still.height - sh) / 2 + oy;
  ctx.fillStyle = '#050506';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(still, sx, sy, sw, sh, 0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, h - 96, w, 96);
  ctx.fillStyle = 'rgba(243,226,191,0.95)';
  ctx.font = '500 17px -apple-system, sans-serif';
  wrapText(ctx, sc.narration, 22, h - 58, w - 44, 21);
  const fade = t < 0.08 ? t / 0.08 : (t > 0.92 ? (1 - t) / 0.08 : 1);
  ctx.fillStyle = `rgba(5,5,6,${1 - fade})`;
  ctx.fillRect(0, 0, w, h);
}

async function mixFilmAudio(scenes, { music, voice, sampleRate = 44100 }) {
  const totalDur = scenes.reduce((a, s) => a + (s.duration || sceneDuration(s.narration)), 0) + 0.2;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(totalDur * sampleRate)), sampleRate);
  const master = off.createGain();
  master.gain.value = 1;
  master.connect(off.destination);
  if (music) {
    for (const f of [110, 164.81, 220]) {
      const o = off.createOscillator();
      const g = off.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.016;
      o.connect(g); g.connect(master);
      o.start(0);
      o.stop(totalDur);
    }
  }
  const pitch = VOICE_PITCH[voice] || 145;
  let when = 0.08;
  for (const sc of scenes) {
    const dur = sc.duration || sceneDuration(sc.narration);
    const buf = synthesizeNarration(off, sc.narration, dur, pitch);
    const src = off.createBufferSource();
    src.buffer = buf;
    const g = off.createGain();
    g.gain.value = 0.95;
    src.connect(g); g.connect(master);
    src.start(when);
    when += dur;
  }
  return off.startRendering();
}

async function encodeMp4(scenes, { canvas, ctx, w, h, fps, music, voice, onTick }) {
  const vPick = await pickVideoCodec(w, h);
  if (!vPick) throw new Error('no-webcodecs');
  const audioBuf = await mixFilmAudio(scenes, { music, voice, sampleRate: 44100 });
  const aPick = await pickAudioCodec(audioBuf.sampleRate);
  if (!aPick) throw new Error('no-webcodecs-audio');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: w, height: h },
    audio: {
      codec: aPick.mux,
      numberOfChannels: 1,
      sampleRate: audioBuf.sampleRate
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  });

  let vErr = null;
  const vEnc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { vErr = e; }
  });
  vEnc.configure(vPick.config);

  const aEnc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: e => { vErr = e; }
  });
  aEnc.configure(aPick.config);

  const ch = audioBuf.getChannelData(0);
  const sr = audioBuf.sampleRate;
  const slice = 1024;
  for (let i = 0; i < ch.length; i += slice) {
    if (vErr) throw vErr;
    const n = Math.min(slice, ch.length - i);
    const data = new Float32Array(n);
    data.set(ch.subarray(i, i + n));
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: sr,
      numberOfFrames: n,
      numberOfChannels: 1,
      timestamp: Math.round((i / sr) * 1e6),
      data
    });
    aEnc.encode(ad);
    ad.close();
    await drainEncoder(aEnc);
  }
  await aEnc.flush();
  aEnc.close();

  let frameIndex = 0;
  const frameDur = Math.round(1e6 / fps);
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = sc.duration || sceneDuration(sc.narration);
    const still = sc.canvas || paintStill(sc.visual);
    const frames = Math.max(Math.round(dur * fps), 8);
    onTick?.('film', `Filming scene ${i + 1} / ${scenes.length}`);
    for (let f = 0; f < frames; f++) {
      if (vErr) throw vErr;
      drawKenBurnsFrame(ctx, still, sc, f, frames, w, h);
      const vf = new VideoFrame(canvas, {
        timestamp: frameIndex * frameDur,
        duration: frameDur
      });
      vEnc.encode(vf, { keyFrame: f === 0 || frameIndex % fps === 0 });
      vf.close();
      frameIndex++;
      await drainEncoder(vEnc);
      if (f % 6 === 0) await wait(0);
    }
  }
  await vEnc.flush();
  vEnc.close();
  if (vErr) throw vErr;
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  if (!blob.size) throw new Error('MP4 encoder produced an empty file');
  return blob;
}

async function recordMp4Fallback(scenes, { canvas, ctx, w, h, fps, music, voice, onTick }) {
  const mime = pickMime();
  if (!mime) throw new Error('This browser cannot write MP4. Try Chrome, Edge, or Safari.');
  const vStream = canvas.captureStream(fps);
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  const master = audioCtx.createGain();
  master.gain.value = 1;
  master.connect(dest);
  if (music) {
    for (const f of [110, 164.81, 220]) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.016;
      o.connect(g); g.connect(master);
      o.start();
    }
  }
  const pitch = VOICE_PITCH[voice] || 145;
  let when = audioCtx.currentTime + 0.12;
  for (const sc of scenes) {
    const dur = sc.duration || sceneDuration(sc.narration);
    const buf = synthesizeNarration(audioCtx, sc.narration, dur, pitch);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.value = 0.95;
    src.connect(g); g.connect(master);
    src.start(when);
    when += dur;
  }
  const mixed = new MediaStream([
    ...vStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);
  const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 2_800_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });
  rec.start(120);
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = sc.duration || sceneDuration(sc.narration);
    const still = sc.canvas || paintStill(sc.visual);
    const frames = Math.max(Math.round(dur * fps), 8);
    onTick?.('film', `Recording MP4 · scene ${i + 1} / ${scenes.length}`);
    for (let f = 0; f < frames; f++) {
      drawKenBurnsFrame(ctx, still, sc, f, frames, w, h);
      await wait(1000 / fps);
    }
  }
  rec.stop();
  await stopped;
  try { await audioCtx.close(); } catch {}
  const type = rec.mimeType || mime;
  if (!/mp4/i.test(type)) {
    throw new Error('This browser would only record WebM. Use Chrome, Edge, or Safari for MP4.');
  }
  const blob = new Blob(chunks, { type: 'video/mp4' });
  if (!blob.size) throw new Error('Recorder produced an empty file');
  return blob;
}

export async function assembleKenBurns(scenes, { music = true, voice = 'nova', onTick, liveCanvas } = {}) {
  const w = 960, h = 540, fps = 24;
  const canvas = liveCanvas || document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  try {
    return await encodeMp4(scenes, { canvas, ctx, w, h, fps, music, voice, onTick });
  } catch (e) {
    try {
      return await recordMp4Fallback(scenes, { canvas, ctx, w, h, fps, music, voice, onTick });
    } catch (e2) {
      throw (e && !String(e.message || e).includes('no-webcodecs')) ? e : e2;
    }
  }
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text || '').split(/\s+/);
  let line = '', yy = y, lines = 0;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word; yy += lh; lines++;
      if (lines >= 2) {
        ctx.fillText(line.replace(/…$/, '') + '…', x, yy);
        return;
      }
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

export async function runPhoneStudio({ topic, nScenes, music, voice, onProgress, liveCanvas }) {
  onProgress?.('script', 'Writing script…');
  const job = writeScript(topic, nScenes);
  job.scenes.forEach(s => { s.duration = sceneDuration(s.narration); s.canvas = paintStill(s.visual); });
  onProgress?.('script_done', { title: job.title, scenes: job.scenes });
  onProgress?.('voice', 'Building narrator track…');
  await wait(40);
  onProgress?.('image', 'Painting stills…');
  onProgress?.('image_done', { scenes: job.scenes });
  onProgress?.('film', 'Encoding MP4…');
  const blob = await assembleKenBurns(job.scenes, {
    music,
    voice: voice || 'nova',
    liveCanvas: liveCanvas || (typeof document !== 'undefined' ? document.getElementById('studio-canvas') : null),
    onTick: (k, msg) => onProgress?.(k, msg)
  });
  const url = URL.createObjectURL(blob);
  onProgress?.('done', {
    url, blob, ext: 'mp4', title: job.title,
    duration: job.scenes.reduce((a, s) => a + s.duration, 0)
  });
  return { ...job, blob, url, ext: 'mp4' };
}

export async function runServerStudio({ baseUrl, topic, voice, nScenes, music, onProgress }) {
  const base = String(baseUrl || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const res = await fetch(`${base}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, voice, n_scenes: nScenes, music })
  });
  if (!res.ok) throw new Error('Studio server HTTP ' + res.status);
  const start = await res.json();
  const id = start.job_id;
  if (!id) throw new Error('Server did not return a job id');
  await new Promise((resolve, reject) => {
    const es = new EventSource(`${base}/api/jobs/${id}/events`);
    es.addEventListener('script_done', e => onProgress?.('script_done', JSON.parse(e.data)));
    es.addEventListener('audio', e => onProgress?.('voice', JSON.parse(e.data).status || 'Voice…'));
    es.addEventListener('image_done', e => onProgress?.('image_done', JSON.parse(e.data)));
    es.addEventListener('assemble', () => onProgress?.('film', 'Assembling…'));
    es.addEventListener('done', e => {
      const d = JSON.parse(e.data);
      onProgress?.('done', { url: base + (d.video_url || ''), title: d.title, duration: d.duration, ext: 'mp4' });
    });
    es.addEventListener('complete', () => { es.close(); resolve(); });
    es.addEventListener('error', e => {
      try {
        const d = JSON.parse(e.data);
        es.close();
        reject(new Error(d.message || 'Studio error'));
      } catch {
        es.close();
        reject(new Error('Lost connection to studio server. Run uvicorn on port 8000, or use This phone.'));
      }
    });
  });
}

export function speakScenes() {
  /* Live speechSynthesis is not in the file. Voice is mixed into the MP4. */
}
