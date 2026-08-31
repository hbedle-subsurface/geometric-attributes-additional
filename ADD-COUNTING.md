# Adding page-view counting to a teaching repository

Hand this whole file to whoever is working on the repository. It contains
everything needed — no other file has to be consulted.

## Context

Heather Bedle (University of Oklahoma, AASPI) publishes several teaching sites
from separate GitHub repositories, all served under one domain:

```
hbedle-subsurface.github.io/single-trace/
hbedle-subsurface.github.io/geometric-attributes/
hbedle-subsurface.github.io/avo-basics/
hbedle-subsurface.github.io/seismic_resolution/
```

A single GoatCounter account, code `hbedle`, covers all of them. The path is
what tells them apart, so no per-repository account, code or dashboard is
needed, and the code below goes in unchanged. Counts appear at
https://hbedle.goatcounter.com, listed page by page — so every module gets its
own row automatically.

GoatCounter is free for non-commercial use, sets no cookies, stores no personal
data, and needs no consent banner.

## Step 1 — create `assets/count.js`

Create this file at `assets/count.js`, exactly as written. Do not change the
code. If the repository has no `assets/` folder, make one.

```js
/* ===========================================================================
   count.js — page-view counting, and nothing else
   Heather Bedle / AASPI / University of Oklahoma

   The same file is used unchanged by every teaching repository. They are all
   served from hbedle-subsurface.github.io, so one counting account covers all
   of them and the path tells them apart:

       /single-trace/modules/instantaneous.html
       /geometric-attributes/modules/curvature.html
       /attribute_quiz/

   Why this exists: knowing which modules get used decides which ones get built
   next and which need rewriting. Knowing anything about the person using them
   does not, so nothing here tries to.

   WHAT IS SENT, once per page load: the page path, the page title, the
   referrer, the screen size, and the browser's own user-agent string. No
   cookies are set and no identifier is stored. Nothing that happens inside a
   module — no slider, no click, no computed trace — ever leaves the browser.
   The modules themselves make no network requests at all.

   THIS IS SWITCHED ON. The account is `hbedle` and the counts are at
     https://hbedle.goatcounter.com, listed by page. The same code is used in
     every repository, which is what makes one dashboard cover all of them.

   TO SWITCH IT OFF
     Empty COUNT_CODE, or delete this file and the one <script> line that loads
     it at the foot of each page. Nothing else depends on it, in any repository.

   The page title is what makes the dashboard readable, since GoatCounter shows
   it beside the path. A page called "Untitled" counts perfectly well and tells
   you nothing.
   =========================================================================== */

(function () {
  'use strict';

  var COUNT_CODE = 'hbedle';           // counts at https://hbedle.goatcounter.com
  var COUNT_HOST = '';                 // <- or a full endpoint, if self-hosted

  // Nothing to do until it has been configured. This is the shipped state.
  if (!COUNT_CODE && !COUNT_HOST) return;

  // Never count a local copy. A module opened from disk, or served from a
  // laptop during a lecture, is not a visit to the site.
  var host = location.hostname;
  if (location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1') return;

  // Honor Do Not Track, even though this collects no personal data. Someone who
  // has asked not to be counted has asked clearly enough.
  var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  if (dnt === '1' || dnt === 'yes') return;

  var endpoint = COUNT_HOST || ('https://' + COUNT_CODE + '.goatcounter.com/count');
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', endpoint);
  // If the script cannot be reached — offline, blocked, service down — the page
  // carries on exactly as before. Counting is never allowed to matter.
  s.onerror = function () { /* not counted, no consequence */ };
  document.head.appendChild(s);
})();
```

## Step 2 — load it from every HTML page

Add one line to each page, immediately before the page's own `<script>` tags
near the bottom of the body. **The relative path depends on where the page
sits.**

A page at the repository root (`index.html`):

```html
<script src="assets/count.js"></script>
```

A page one folder down (`modules/anything.html`):

```html
<script src="../assets/count.js"></script>
```

For example, a module's script block becomes:

```html
<script src="../assets/count.js"></script>
<script src="../assets/seismic.js"></script>
<script src="../assets/whatever-else.js"></script>
<script>
  // the module's own code
</script>
```

Every HTML page in the repository needs the line, including the landing page.
A page without it is invisible in the dashboard, which looks exactly like a page
nobody visits.

## Step 3 — say so on the site

The site should state what it records. Two places, in Heather's voice:

**On the landing page**, in the About section:

> Everything runs in the browser. No installation and no account. Nothing you do
> inside a module — no slider, no click, no trace you generate — is transmitted
> anywhere, and the modules make no network requests at all.
>
> The one thing recorded is that a page was opened. No cookie, no account,
> nothing about you. I keep that count for two reasons: so the modules people
> actually use are the ones that get improved, and so I can show my university
> that you all are using these — which is how they keep getting built.

**In each module footer**, shorter:

> Nothing you do in this module leaves your browser. The only thing recorded is
> that the page was opened, so that I can show the university these are being
> used — no cookie, no account, nothing about you.

If the site currently claims "no analytics" or "no data transmitted" anywhere,
that wording has to change, because it would no longer be true.

## Step 4 — check it

After pushing, with the site live on GitHub Pages:

1. Open the landing page and one module on a phone over cellular data, not on
   campus wifi — that gives a clean hit that is not the author's own testing.
2. Wait a minute or two and reload https://hbedle.goatcounter.com.
3. Both pages should appear as separate rows, each with its `<title>` beside the
   path.
4. In GoatCounter's Settings, add the office IP under **Ignore IPs**, or the
   author's own editing sessions will be a visible share of the early numbers
   while traffic is still small.

If nothing appears: check the browser console for a 404 on `count.js` (usually a
wrong relative path, or a case mismatch — GitHub Pages is case-sensitive where
macOS is not), and check that an ad blocker is not blocking `gc.zgo.at`.

## What not to do

- **Do not add event tracking.** No reporting of tab clicks, slider moves,
  exercise reveals, or time on page. Counting page loads is a visitor log;
  counting what someone does inside a module is watching them work, and it
  would contradict what the site tells people it does. If per-step counts are
  ever wanted, they need a deliberate decision and their own note on the page.
- **Do not modify the guards** in `count.js`. The `file://`, `localhost` and
  Do Not Track checks are there on purpose.
- **Do not add a second analytics tool.**
- **Do not put the script in the `<head>`** or make it blocking. It belongs at
  the foot of the body, and the page must work perfectly if it never loads.

## What to expect from the numbers

GoatCounter counts page loads, not clicks, so a module registers however the
visitor arrived: from the site's own index, from a bookmark, from a search
result, from a link in a syllabus, or from a shared URL carrying module state in
its query string. The index and each module are counted separately.

Two limits worth stating plainly. Visitors running ad blockers are invisible, so
treat totals as a floor rather than a count — the comparison between modules
stays reliable, which is what matters for deciding what to build next. And a
module opened from a downloaded or emailed copy is never counted, by design.
