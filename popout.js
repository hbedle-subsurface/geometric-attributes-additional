/* ===========================================================================
   popout.js — open the exercises in a second window, and nothing else
   Heather Bedle / AASPI / University of Oklahoma

   The same file is used unchanged by every teaching repository.

   Why this exists: the exercises tell the student what to change and what to
   watch, and both of those happen on a different tab of the same page. A
   student following exercise 3 has to leave the exercise to do it, then come
   back to read what they were supposed to have noticed. Opening the exercises
   in their own window lets them sit side by side with the controls.

   WHAT IT DOES: copies the text that is already on the page into a second
   window. Nothing is fetched, nothing is sent, nothing is stored. It works
   from a file:// copy on a laptop with no network, which is the case that
   matters during a lecture.

   HOW TO INSTALL: see ADD-POPOUT.md. One script tag per module, no markup
   change and no stylesheet change. If this file is missing or stale, the
   button does not appear and the exercises tab works exactly as before —
   which is why no module carries a local fallback for it.

   License: free to use for teaching, demonstration and non-commercial study
   with credit. No republishing or redistribution without permission.
   =========================================================================== */

(function () {
  'use strict';

  // The exercises pane. Every module in every set uses this id.
  var PANE_ID = 'pe';

  // One window per module, so a student comparing curvature with coherence
  // gets two pop-outs rather than one that keeps being overwritten.
  function windowName() {
    var path = (location.pathname || 'module').replace(/[^A-Za-z0-9]+/g, '_');
    return 'exercises_' + path;
  }

  // The module name, for the pop-out's title bar and heading.
  function moduleTitle() {
    var h1 = document.querySelector('.mod-head h1') || document.querySelector('h1');
    return h1 ? h1.textContent.trim() : (document.title || 'Exercises');
  }

  // Everything the parent page links in its head — the stylesheet and the
  // fonts. Reading .href rather than the attribute gives an absolute URL, so
  // it resolves from about:blank, and from file:// as well.
  function headLinks() {
    var out = '';
    var links = document.querySelectorAll('head link[rel="stylesheet"], head link[rel="preconnect"]');
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      out += '<link rel="' + l.rel + '" href="' + l.href + '"' +
             (l.crossOrigin ? ' crossorigin' : '') + '>\n';
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The pop-out's own layout. The site stylesheet does the rest, so the
  // exercises look the same in both windows.
  var OWN_CSS = [
    'body { margin:0; padding:22px; background:var(--paper,#fff); }',
    '.po-head { display:flex; align-items:baseline; justify-content:space-between;',
    '  gap:14px; margin:0 0 16px; padding-bottom:12px;',
    '  border-bottom:1px solid var(--rule,#d8d8d8); }',
    '.po-head h1 { font-family:var(--display,Archivo,sans-serif); font-size:19px;',
    '  margin:0; color:var(--ink,#16191C); }',
    '.po-head .po-note { font-family:var(--mono,monospace); font-size:11px;',
    '  letter-spacing:.08em; text-transform:uppercase; color:var(--slate,#5C6670); }',
    '.po-foot { margin-top:18px; font-size:12.5px; color:var(--slate,#5C6670); }',
    '@media print { .po-foot { display:none; } .reveal { display:block; } }'
  ].join('\n');

  function buildDocument(paneHtml) {
    var title = moduleTitle();
    return '<!doctype html>\n<html lang="en">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>Exercises — ' + escapeHtml(title) + '</title>\n' +
      headLinks() +
      '<style>\n' + OWN_CSS + '\n</style>\n' +
      '</head>\n<body>\n' +
      '<div class="po-head">' +
        '<h1>' + escapeHtml(title) + '</h1>' +
        '<span class="po-note">Exercises</span>' +
      '</div>\n' +
      paneHtml + '\n' +
      '<p class="po-foot">Keep this window beside the module. The controls stay ' +
      'in the other window; this copy does not update when you move them.</p>\n' +
      '</body>\n</html>';
  }

  // The pane's contents, minus the button that opened this window.
  function paneContents(pane) {
    var clone = pane.cloneNode(true);
    var btn = clone.querySelector('.po-open');
    if (btn) btn.parentNode.removeChild(btn);
    return clone.innerHTML;
  }

  function openPopout(pane, button) {
    var w;
    try {
      w = window.open('', windowName(), 'width=560,height=760,scrollbars=yes,resizable=yes');
    } catch (e) {
      w = null;
    }

    // Blocked, or opened into nothing. Say so where the student is looking.
    if (!w) {
      button.textContent = 'Pop-up blocked — allow pop-ups for this page';
      button.disabled = true;
      setTimeout(function () {
        button.textContent = 'Open in new window';
        button.disabled = false;
      }, 4000);
      return;
    }

    try {
      w.document.open();
      w.document.write(buildDocument(paneContents(pane)));
      w.document.close();
      w.focus();
    } catch (e) {
      // Some browsers refuse document.write into a reused window. Close it and
      // let the student try again rather than leaving a blank window sitting
      // there looking broken.
      try { w.close(); } catch (e2) { /* nothing further to do */ }
      button.textContent = 'Could not open — try again';
      setTimeout(function () { button.textContent = 'Open in new window'; }, 4000);
    }
  }

  function init() {
    var pane = document.getElementById(PANE_ID);
    if (!pane) return;

    var head = pane.querySelector('h3');
    if (!head) return;

    // Put the button on the existing heading row. Done from script so the
    // stylesheet needs no change and this file stays drop-in.
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.justifyContent = 'space-between';
    head.style.gap = '14px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost small po-open';
    btn.textContent = 'Open in new window';
    btn.title = 'Open these exercises in a second window so you can read them while you work the controls';
    btn.addEventListener('click', function () { openPopout(pane, btn); });
    head.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
