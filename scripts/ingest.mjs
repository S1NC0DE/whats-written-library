// Turns an "Add a slide" or "Fix a word" issue into changes to data/*.json.
// No dependencies. Run by .github/workflows/ingest.yml; also importable for tests.
import fs from 'node:fs';
import path from 'node:path';

const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const LIMIT = { lecture: 120, title: 200, text: 8000, word: 120 };

export function parseForm(body) {
  const out = {};
  const parts = String(body || '').replace(/\r/g, '').split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const label = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    let value = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    value = value.replace(/^```[a-z]*\n([\s\S]*?)\n?```$/i, '$1').trim();
    if (value === '_No response_') value = '';
    out[label] = value;
  }
  return out;
}

export const slug = s => String(s).toLowerCase().replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'slide';

function firstImageUrl(s) {
  const m = String(s || '').match(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/) || String(s || '').match(/<img[^>]+src="(https:\/\/[^"]+)"/i);
  if (!m) return '';
  const u = m[1];
  return /^https:\/\/(github\.com\/user-attachments\/|user-images\.githubusercontent\.com\/|private-user-images\.githubusercontent\.com\/)/.test(u) ? u : '';
}

export function isTrusted(event) {
  const issue = event.issue || {};
  if (TRUSTED.has(issue.author_association)) return true;
  // a maintainer can accept anyone's issue by adding the "approved" label
  return event.action === 'labeled' && event.label && event.label.name === 'approved';
}

export function apply(event, notes, dict) {
  const issue = event.issue || {};
  const labels = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  const f = parseForm(issue.body);

  if (labels.includes('add-slide')) {
    const lecture = (f['lecture'] || '').slice(0, LIMIT.lecture);
    const date = (f['date'] || '').trim();
    const title = (f['slide title'] || '').slice(0, LIMIT.title);
    const text = (f['text'] || '').slice(0, LIMIT.text);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T12:00:00'))) return { ok: false, message: 'The date must look like 2026-11-16.' };
    if (!title || !text) return { ok: false, message: 'Slide title and text are both needed.' };
    let id = `${date}-${slug(title)}`, k = 2;
    while (notes.some(n => n.id === id)) id = `${date}-${slug(title)}-${k++}`;
    notes.push({ id, lecture, date, title, text, image: firstImageUrl(f['photo (optional)']), added_by: (issue.user && issue.user.login) || '', issue: issue.number || null });
    return { ok: true, changed: true, id, message: `Added **${title}** to the library.` };
  }

  if (labels.includes('fix-word')) {
    const id = (f['slide id'] || '').trim();
    const wrong = (f['wrong word or phrase'] || '').slice(0, LIMIT.word).trim();
    const right = (f['correct word or phrase'] || '').slice(0, LIMIT.word).trim();
    if (!wrong || !right || wrong === right) return { ok: false, message: 'Give both the wrong and the correct word, and make them different.' };
    const note = notes.find(n => n.id === id);
    if (!note) return { ok: false, message: `No slide with ID \`${id}\` was found.` };
    const esc = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, 'gu');
    if (!re.test(note.text)) return { ok: false, message: `"${wrong}" does not appear in that slide's text.` };
    note.text = note.text.replace(re, (_, pre) => pre + right);
    const key = wrong.toLowerCase();
    const existing = dict.fixes.find(x => x.wrong.toLowerCase() === key && x.right.toLowerCase() === right.toLowerCase());
    if (existing) existing.count = (existing.count || 1) + 1; else dict.fixes.push({ wrong, right, count: 1 });
    return { ok: true, changed: true, id, message: `Changed "${wrong}" to "${right}" and added it to the dictionary.` };
  }

  return { ok: false, skip: true, message: 'Not a library issue.' };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] || '.';
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const outFile = process.env.GITHUB_OUTPUT;
  const write = (k, v) => outFile && fs.appendFileSync(outFile, `${k}<<__EOF__\n${v}\n__EOF__\n`);
  let result;
  if (!isTrusted(event)) {
    result = { ok: false, pending: true, message: 'Thanks! A maintainer will review this and add the `approved` label to publish it.' };
  } else {
    const np = path.join(root, 'data/notes.json'), dp = path.join(root, 'data/dictionary.json');
    const notes = JSON.parse(fs.readFileSync(np, 'utf8'));
    const dict = JSON.parse(fs.readFileSync(dp, 'utf8'));
    result = apply(event, notes, dict);
    if (result.changed) {
      fs.writeFileSync(np, JSON.stringify(notes, null, 2) + '\n');
      fs.writeFileSync(dp, JSON.stringify(dict, null, 2) + '\n');
    }
  }
  console.log(JSON.stringify(result));
  write('changed', result.changed ? 'true' : 'false');
  write('close', result.ok || (!result.pending && !result.skip) ? 'true' : 'false');
  write('skip', result.skip ? 'true' : 'false');
  write('id', result.id || '');
  write('message', result.message || '');
}
