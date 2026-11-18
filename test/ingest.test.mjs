import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForm, apply, isTrusted, slug } from '../scripts/ingest.mjs';

const addBody = (o = {}) => `### Lecture

${o.lecture ?? 'Strategic Issues in SCM'}

### Date

${o.date ?? '2026-11-18'}

### Slide title

${o.title ?? 'Postponement & Risk'}

### Text

\`\`\`text
${o.text ?? '- Delay differentiation\n  - paint at the end\n- Pool risk [?]'}
\`\`\`

### Photo (optional)

${o.photo ?? '_No response_'}`;

const fixBody = (id, wrong, right) => `### Slide ID\n\n${id}\n\n### Wrong word or phrase\n\n${wrong}\n\n### Correct word or phrase\n\n${right}`;
const ev = (body, labels, extra = {}) => ({ action: 'opened', issue: { number: 7, body, labels: labels.map(name => ({ name })), author_association: 'OWNER', user: { login: 'jay' }, ...extra } });
const fresh = () => ({ notes: [{ id: 'n1', title: 'T', text: '- More different tools or more skilled talents\n- toolset stays', date: '2026-11-16', lecture: 'L' }], dict: { terms: [], fixes: [] } });

test('parses issue form, strips code fence and _No response_', () => {
  const f = parseForm(addBody());
  assert.equal(f['lecture'], 'Strategic Issues in SCM');
  assert.equal(f['text'], '- Delay differentiation\n  - paint at the end\n- Pool risk [?]');
  assert.equal(f['photo (optional)'], '');
});

test('adds a slide with a stable id', () => {
  const { notes, dict } = fresh();
  const r = apply(ev(addBody(), ['add-slide']), notes, dict);
  assert.equal(r.ok, true); assert.equal(r.id, '2026-11-18-postponement-risk');
  const n = notes.at(-1);
  assert.equal(n.text.split('\n').length, 3); assert.equal(n.issue, 7); assert.equal(n.added_by, 'jay');
});

test('duplicate titles on same day get -2', () => {
  const { notes, dict } = fresh();
  apply(ev(addBody(), ['add-slide']), notes, dict);
  const r = apply(ev(addBody(), ['add-slide']), notes, dict);
  assert.equal(r.id, '2026-11-18-postponement-risk-2');
});

test('keeps GitHub-hosted photo, drops other hosts', () => {
  const { notes, dict } = fresh();
  apply(ev(addBody({ photo: '![s](https://github.com/user-attachments/assets/abc-123)' }), ['add-slide']), notes, dict);
  assert.equal(notes.at(-1).image, 'https://github.com/user-attachments/assets/abc-123');
  apply(ev(addBody({ photo: '![s](https://evil.example/x.png)' }), ['add-slide']), notes, dict);
  assert.equal(notes.at(-1).image, '');
  apply(ev(addBody({ photo: '<img width="300" alt="x" src="https://github.com/user-attachments/assets/def" />' }), ['add-slide']), notes, dict);
  assert.equal(notes.at(-1).image, 'https://github.com/user-attachments/assets/def');
});

test('rejects bad date / missing text', () => {
  const { notes, dict } = fresh();
  assert.equal(apply(ev(addBody({ date: '18.11.2026' }), ['add-slide']), notes, dict).ok, false);
  assert.equal(apply(ev(addBody({ date: '2026-13-45' }), ['add-slide']), notes, dict).ok, false);
  assert.equal(apply(ev(addBody({ text: '_No response_' }), ['add-slide']), notes, dict).ok, false);
  assert.equal(notes.length, 1);
});

test('caps very long text', () => {
  const { notes, dict } = fresh();
  apply(ev(addBody({ text: 'x'.repeat(20000) }), ['add-slide']), notes, dict);
  assert.equal(notes.at(-1).text.length, 8000);
});

test('fix replaces whole words only and grows dictionary', () => {
  const { notes, dict } = fresh();
  const r = apply(ev(fixBody('n1', 'tools', 'talents'), ['fix-word']), notes, dict);
  assert.equal(r.ok, true);
  assert.equal(notes[0].text, '- More different talents or more skilled talents\n- toolset stays');
  assert.deepEqual(dict.fixes, [{ wrong: 'tools', right: 'talents', count: 1 }]);
  apply(ev(fixBody('n1', 'more skilled', 'better skilled'), ['fix-word']), notes, dict);
  assert.match(notes[0].text, /better skilled talents/);
});

test('repeat fix increments count', () => {
  const a = fresh(), b = fresh();
  apply(ev(fixBody('n1', 'tools', 'talents'), ['fix-word']), a.notes, a.dict);
  b.dict = a.dict;
  apply(ev(fixBody('n1', 'tools', 'talents'), ['fix-word']), b.notes, b.dict);
  assert.equal(a.dict.fixes[0].count, 2);
});

test('fix: regex characters in input are literal', () => {
  const { notes, dict } = fresh();
  notes[0].text = '- cost (a+b)* rises';
  const r = apply(ev(fixBody('n1', '(a+b)*', '(a + b)'), ['fix-word']), notes, dict);
  assert.equal(r.ok, true); assert.equal(notes[0].text, '- cost (a + b) rises');
});

test('fix errors: unknown slide, word not present, same word', () => {
  const { notes, dict } = fresh();
  assert.equal(apply(ev(fixBody('nope', 'a', 'b'), ['fix-word']), notes, dict).ok, false);
  assert.equal(apply(ev(fixBody('n1', 'zebra', 'b'), ['fix-word']), notes, dict).ok, false);
  assert.equal(apply(ev(fixBody('n1', 'tools', 'tools'), ['fix-word']), notes, dict).ok, false);
  assert.equal(dict.fixes.length, 0);
});

test('trust: owner/collaborator yes, stranger needs approved label', () => {
  assert.equal(isTrusted(ev('', [])), true);
  assert.equal(isTrusted(ev('', [], { author_association: 'COLLABORATOR' })), true);
  assert.equal(isTrusted(ev('', [], { author_association: 'NONE' })), false);
  assert.equal(isTrusted({ action: 'labeled', label: { name: 'approved' }, issue: { author_association: 'NONE' } }), true);
  assert.equal(isTrusted({ action: 'labeled', label: { name: 'bug' }, issue: { author_association: 'NONE' } }), false);
});

test('unrelated issue is skipped', () => {
  const { notes, dict } = fresh();
  assert.equal(apply(ev('hello', ['bug']), notes, dict).skip, true);
});

test('slug handles umlauts and symbols', () => {
  assert.equal(slug('Größe & Kosten → €!'), 'grosse-kosten');
  assert.equal(slug('???'), 'slide');
});
