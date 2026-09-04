// Harness: load a real module, run popout.js against it, click the button,
// and inspect the document it writes into the second window.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const modulePath = process.argv[2];
const html = fs.readFileSync(modulePath, 'utf8');

// Capture what window.open is asked for and what gets written into it.
let opened = null;
const fakeWin = {
  focus() { this.focused = true; },
  close() { this.closed = true; },
  document: {
    _buf: '',
    open() { this._buf = ''; },
    write(s) { this._buf += s; },
    close() { }
  }
};

// The published URL is derived from the repository folder name rather than
// hard-coded, so this harness can be copied between sites unchanged.
const repo = path.basename(path.resolve(path.dirname(modulePath), '..'));
const siteBase = 'https://hbedle-subsurface.github.io/' + repo + '/';

const dom = new JSDOM(html, {
  url: siteBase + 'modules/' + path.basename(modulePath),
  runScripts: 'outside-only',
  pretendToBeVisual: true
});

dom.window.open = function (url, name, features) {
  opened = { url, name, features };
  return fakeWin;
};

// Canvas stub so nothing in the page trips over a missing 2d context.
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
  fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  stroke() {}, fill() {}, arc() {}, save() {}, restore() {}, translate() {},
  scale() {}, setTransform() {}, fillText() {}, strokeText() {},
  measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }),
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {}, createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  closePath() {}, rect() {}, clip() {}, drawImage() {}
});

const src = fs.readFileSync(path.join(path.dirname(modulePath), '../assets/popout.js'), 'utf8');
dom.window.eval(src);

// jsdom is still parsing when the script is evaluated, exactly as a browser is
// for a script in the head. Wait for the event the module waits for.
function ready() {
  return new Promise((resolve) => {
    if (dom.window.document.readyState !== 'loading') return resolve();
    dom.window.document.addEventListener('DOMContentLoaded', () => resolve());
  });
}

ready().then(run);

function run() {
const doc = dom.window.document;
const pane = doc.getElementById('pe');
const btn = pane.querySelector('.po-open');

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || '' });

check('exercises pane found', !!pane);
check('button injected', !!btn, btn ? btn.textContent : 'missing');
check('button uses site classes', btn && btn.className.includes('btn ghost small'));
check('heading laid out as a row', pane.querySelector('h3').style.display === 'flex');

btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

check('window.open called', !!opened);
const stem = path.basename(modulePath, '.html');
check('window name is per-module', opened && opened.name.endsWith(stem + '_html'), opened && opened.name);

const out = fakeWin.document._buf;
check('doctype written', out.startsWith('<!doctype html>'));
check('title carries module name', /<title>Exercises — .+<\/title>/.test(out),
      (out.match(/<title>([^<]*)<\/title>/) || [])[1]);
check('stylesheet linked absolutely',
      out.indexOf('<link rel="stylesheet" href="' + siteBase + 'assets/style.css">') !== -1,
      siteBase + 'assets/style.css');
check('fonts linked', /fonts\.googleapis\.com/.test(out));
check('exercise list copied', /<ol>/.test(out) && (out.match(/<li>/g) || []).length >= 5,
      (out.match(/<li>/g) || []).length + ' items');
check('reveal toggles copied', (out.match(/<details class="reveal">/g) || []).length >= 5,
      (out.match(/<details class="reveal">/g) || []).length + ' hints');
check('button not duplicated into popout', !/po-open/.test(out));
check('window focused', fakeWin.focused === true);
check('no server needed: nothing fetched', !/fetch\(|XMLHttpRequest/.test(src));

let fail = 0;
for (const r of results) {
  if (!r.pass) fail++;
  console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '   [' + r.detail + ']' : ''));
}
console.log('\n' + (results.length - fail) + '/' + results.length + ' passed');
process.exit(fail ? 1 : 0);
}
