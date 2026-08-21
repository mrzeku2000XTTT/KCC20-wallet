/* Faceless Video Studio — in-phone Ken Burns film (zip pipeline, no server). */

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
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return '';
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function assembleKenBurns(scenes, { music = true, onTick } = {}) {
  const mime = pickMime();
  if (!mime) throw new Error('This browser cannot record video (needs MediaRecorder / WebM). Try Chrome or Edge.');
  const w = 960, h = 540, fps = 24;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const vStream = canvas.captureStream(fps);
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  if (music) {
    for (const f of [110, 164.81, 220]) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.04;
      o.connect(g); g.connect(dest);
      o.start();
    }
  }
  const mixed = new MediaStream([
    ...vStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);
  const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 2_400_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });
  rec.start(200);

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = sc.duration || sceneDuration(sc.narration);
    const still = sc.canvas || paintStill(sc.visual);
    const frames = Math.max(Math.round(dur * fps), 8);
    onTick?.('film', `Scene ${i + 1} / ${scenes.length}`);
    for (let f = 0; f < frames; f++) {
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
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, h - 86, w, 86);
      ctx.fillStyle = 'rgba(243,226,191,0.92)';
      ctx.font = '500 16px -apple-system, sans-serif';
      wrapText(ctx, sc.narration, 24, h - 54, w - 48, 20);
      const fade = t < 0.08 ? t / 0.08 : (t > 0.92 ? (1 - t) / 0.08 : 1);
      ctx.fillStyle = `rgba(5,5,6,${1 - fade})`;
      ctx.fillRect(0, 0, w, h);
      await wait(1000 / fps);
    }
  }
  rec.stop();
  await stopped;
  try { audioCtx.close(); } catch {}
  const blob = new Blob(chunks, { type: mime });
  if (!blob.size) throw new Error('Recorder produced an empty file');
  return blob;
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

export async function runPhoneStudio({ topic, nScenes, music, onProgress }) {
  onProgress?.('script', 'Writing script…');
  const job = writeScript(topic, nScenes);
  job.scenes.forEach(s => { s.duration = sceneDuration(s.narration); s.canvas = paintStill(s.visual); });
  onProgress?.('script_done', { title: job.title, scenes: job.scenes });
  onProgress?.('voice', 'Timing narration…');
  await wait(200);
  onProgress?.('image', 'Painting stills…');
  onProgress?.('image_done', { scenes: job.scenes });
  onProgress?.('film', 'Recording Ken Burns film…');
  const blob = await assembleKenBurns(job.scenes, {
    music,
    onTick: (k, msg) => onProgress?.(k, msg)
  });
  const url = URL.createObjectURL(blob);
  onProgress?.('done', { url, blob, title: job.title, duration: job.scenes.reduce((a, s) => a + s.duration, 0) });
  return { ...job, blob, url };
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
      onProgress?.('done', { url: base + (d.video_url || ''), title: d.title, duration: d.duration });
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

export function speakScenes(scenes) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  for (const s of scenes || []) {
    const u = new SpeechSynthesisUtterance(s.narration);
    u.rate = 0.92; u.pitch = 0.95;
    window.speechSynthesis.speak(u);
  }
}
