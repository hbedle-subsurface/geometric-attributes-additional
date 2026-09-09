// Harness: load a real module, run panelout.js against it, click the button,
// and check that the second window holds a copy of the panel that is wired to
// the module in both directions.
//
// The second window is an iframe rather than a stub. panelout.js clones the
// panel into it with importNode and then reads and writes both documents, so a
// harness that only records what was written would not see whether any of that
// worked. An iframe belongs to the same jsdom instance, which is what makes the
// import and the event forwarding real here.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const modulePath = process.argv[2];
const html = fs.readFileSync(modulePath, 'utf8');

// The published URL is derived from the repository folder name rather than
// hard-coded, so this harness can be copied between sites unchanged.
const repo = path.basename(path.resolve(path.dirname(modulePath), '..'));
const siteBase = 'https://hbedle-subsurface.github.io/' + repo + '/';

const dom = new JSDOM(html, {
  url: siteBase + 'modules/' + path.basename(modulePath),
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const win = dom.window;
const doc = win.document;

// Canvas stub so nothing in the page trips over a missing 2d context.
win.HTMLCanvasElement.prototype.getContext = () => ({
  fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  stroke() {}, fill() {}, arc() {}, save() {}, restore() {}, translate() {},
  scale() {}, setTransform() {}, fillText() {}, strokeText() {},
  measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }),
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {}, createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  closePath() {}, rect() {}, clip() {}, drawImage() {}
});

// Stand in for the second window. The document panelout writes is parsed by
// the iframe, so everything after the write is a real document.
let opened = null;
let frame = null;
win.open = function (url, name, features) {
  opened = { url, name, features };
  frame = doc.createElement('iframe');
  doc.body.appendChild(frame);
  const w = frame.contentWindow;
  w.HTMLCanvasElement.prototype.getContext = win.HTMLCanvasElement.prototype.getContext;
  return w;
};

const src = fs.readFileSync(path.join(path.dirname(modulePath), '../assets/panelout.js'), 'utf8');
win.eval(src);

// jsdom is still parsing when the script is evaluated, exactly as a browser is
// for a script in the head. Wait for the event the module waits for.
function ready() {
  return new Promise((resolve) => {
    if (doc.readyState !== 'loading') return resolve();
    doc.addEventListener('DOMContentLoaded', () => resolve());
  });
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

ready().then(run);

async function run() {
  const results = [];
  const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || '' });

  const panel = doc.querySelector('.labhead') || doc.querySelector('section.controls');
  const btn = doc.querySelector('.po-panel-open');

  check('control panel found', !!panel, panel && panel.className);
  check('button injected', !!btn, btn ? btn.textContent : 'missing');
  check('button uses site classes', btn && btn.className.includes('btn ghost small'));
  // the stylesheet hides buttons inside the panel, so this one is set inline
  check('button survives the panel button rule', btn && btn.style.display === 'inline-flex',
        btn && btn.style.display);

  const before = panel.getElementsByTagName('*').length;
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(50);

  check('window.open called', !!opened);
  const stem = path.basename(modulePath, '.html');
  check('window name is per-module', opened && opened.name.endsWith(stem + '_html'), opened && opened.name);

  const pdoc = frame.contentWindow.document;
  const wrap = pdoc.getElementById('poWrap');
  const clone = wrap && wrap.firstElementChild;

  check('panel cloned into the window', clone && clone.className === panel.className);
  check('clone matches the panel element for element',
        clone && clone.getElementsByTagName('*').length === before,
        clone ? clone.getElementsByTagName('*').length + ' against ' + before : '');
  check('no pairing warning shown', !wrap.querySelector('p[style*="841617"]'));
  check('title carries module name', /<title>Controls — .+<\/title>/.test(pdoc.documentElement.outerHTML)
        || /Controls/.test(pdoc.title), pdoc.title);
  check('stylesheet linked absolutely',
        !!pdoc.querySelector('link[href="' + siteBase + 'assets/style.css"]'),
        siteBase + 'assets/style.css');
  check('button not duplicated as a live control',
        !clone.querySelector('.po-panel-open:not([disabled])'));

  // The panel is hidden without leaving the layout, so the module can still
  // measure the width of its canvases.
  const holder = panel.parentElement;
  check('panel parked in a zero-height wrapper',
        holder && /height:0/.test(holder.getAttribute('style') || ''),
        holder && holder.getAttribute('style'));
  check('a line is left in its place', !!doc.querySelector('.labhead, section.controls') &&
        holder.previousElementSibling && /Bring them back/.test(holder.previousElementSibling.textContent));

  // A slider moved in the second window must reach the module.
  const cRange = clone.querySelector('input[type="range"]');
  let saw = 0;
  if (cRange) {
    const real = doc.getElementById(cRange.id);
    real.addEventListener('input', () => { saw++; });
    const step = parseFloat(cRange.step || 1);
    cRange.value = String(Math.min(parseFloat(cRange.value) + step * 2, parseFloat(cRange.max)));
    cRange.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
    check('slider drives the module', real.value === cRange.value && saw > 0,
          cRange.id + ' = ' + real.value + ', ' + saw + ' event(s)');
  } else {
    check('slider drives the module', false, 'no range control in the panel');
  }

  // A menu carries its state as a property, so the copy has to be told.
  const cSel = clone.querySelector('select');
  if (cSel) {
    const realSel = doc.getElementById(cSel.id);
    const other = Array.from(realSel.options).find((o) => o.value !== realSel.value);
    realSel.value = other.value;
    await tick(200);
    check('menu set by the module follows in the copy', cSel.value === realSel.value,
          cSel.id + ' = ' + cSel.value);
  } else {
    check('menu set by the module follows in the copy', true, 'no menu in this panel');
  }

  // A readout the module rewrites has to reach the copy as well.
  const cVal = clone.querySelector('.val[id]');
  if (cVal) {
    const realVal = doc.getElementById(cVal.id);
    realVal.textContent = 'harness';
    await tick(200);
    check('readout mirrored back', cVal.textContent === 'harness', cVal.id);
  } else {
    check('readout mirrored back', true, 'no readout in this panel');
  }

  // A step that hides the panel must not leave a copy that looks live.
  panel.hidden = true;
  await tick(200);
  check('hidden panel dims its copy', clone.style.opacity === '0.35', clone.style.opacity);
  panel.hidden = false;
  await tick(200);

  // Bringing it back has to put the panel where it was.
  const back = doc.querySelector('.labhead, section.controls').parentElement
    .previousElementSibling.querySelector('button');
  back.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(50);
  const nowPanel = doc.querySelector('.labhead') || doc.querySelector('section.controls');
  check('panel put back in the flow',
        !/height:0/.test((nowPanel.parentElement.getAttribute('style') || '')));
  check('button offered again', btn.disabled === false && /second window/.test(btn.textContent),
        btn.textContent);

  check('no server needed: nothing fetched', !/fetch\(|XMLHttpRequest/.test(src));

  let fail = 0;
  for (const r of results) {
    if (!r.pass) fail++;
    console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '   [' + r.detail + ']' : ''));
  }
  console.log('\n' + (results.length - fail) + '/' + results.length + ' passed');
  process.exit(fail ? 1 : 0);
}
