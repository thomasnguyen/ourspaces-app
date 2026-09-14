// Turn the storyboard's beat data into two CapCut-importable subtitle tracks:
// every spoken line at its timecode, and one marker per beat. Run via
// `npm run sync:storyboard`. Import into CapCut desktop (Captions > Add
// Captions) as a timeline skeleton, then delete both tracks before export.
import { readFileSync, writeFileSync } from 'fs';

const html = readFileSync('docs/local/demo-video-storyboard.html', 'utf8');

// Pull `const beats = [ ... ];` out of the page and eval just that literal.
// Strings in the file use curly apostrophes, so plain '...' scanning is safe.
const start = html.indexOf('const beats = [');
if (start < 0) throw new Error('beats array not found');
const open = html.indexOf('[', start);
let depth = 0, inStr = false, end = -1;
for (let i = open; i < html.length; i++) {
  const c = html[i];
  if (inStr) { if (c === '\\') i++; else if (c === "'") inStr = false; continue; }
  if (c === "'") inStr = true;
  else if (c === '[' || c === '{') depth++;
  else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const beats = eval(html.slice(open, end));

const secs = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
const stamp = (v) => {
  const ms = Math.round(v * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};
const srt = (cues) => cues.map((c, i) =>
  `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');

// ── dialogue ───────────────────────────────────────────────────────────────
// Every spoken line, at its own timecode. Length is a natural reading pace
// (~2.7 words/sec, floor 1.2s) rather than stretching to the next line — the
// gaps are the silent beats, and seeing them is the point.
// `who: 'silent'` entries are storyboard annotations ("no line — end"), not
// dialogue — they'd import as a zero-length caption.
const lines = beats.flatMap((b) => (b.lines ?? []).filter((l) => l.who !== 'silent').map((l) => ({
  start: secs(l.t),
  who: l.who === 'holly' ? 'HOLLY' : l.who === 'thomas' ? 'THOMAS' : l.who.toUpperCase(),
  say: l.say,
}))).sort((a, b) => a.start - b.start);

const END = 175; // 2:55, the cap
const dialogue = lines.map((l, i) => {
  const next = lines[i + 1]?.start ?? END;
  const paced = Math.max(1.2, l.say.split(/\s+/).length / 2.7);
  return { start: l.start, end: Math.min(l.start + paced, next), text: `${l.who}: ${l.say}` };
});

// ── beat markers ───────────────────────────────────────────────────────────
// One cue per beat, spanning its full duration: the shot you owe, as a strip
// you can see. Import on a second text track and delete both before export.
// Clamped to the next beat's start: the storyboard's own rounding overlaps in
// a couple of places (0:04 +1.5s runs into the 0:05 beat) and CapCut stacks
// overlapping cues into a mess.
const markers = beats.map((b, i) => {
  const start = secs(b.t);
  const next = beats[i + 1] ? secs(beats[i + 1].t) : END;
  return {
    start,
    end: Math.min(start + parseFloat(b.dur), next),
    text: `[${i + 1}/${beats.length}] ${b.t} · ${b.dur} — ${b.shot}`,
  };
});

writeFileSync('docs/local/demo-video-dialogue.srt', srt(dialogue));
writeFileSync('docs/local/demo-video-beats.srt', srt(markers));
console.log(`dialogue: ${dialogue.length} cues, last ends ${stamp(dialogue.at(-1).end)}`);
console.log(`beats:    ${markers.length} cues, last ends ${stamp(markers.at(-1).end)}`);
