# More Geometric Attributes, and How They Actually Work

Interactive teaching modules on four further AASPI geometric attribute
programs, built for the School of Geosciences at the University of Oklahoma
with the [AASPI](https://www.ou.edu/mcee/labs/aaspi) consortium.

Live at **https://hbedle-subsurface.github.io/geometric-attributes-additional/**

Companion to
[**How Geometric Attributes Actually Work**](https://hbedle-subsurface.github.io/geometric-attributes/),
which covers dip, coherence, curvature and aberrancy. This set takes the
programs that sit alongside those: the filtering that usually runs before them,
and three attributes that measure things coherence and curvature were never
built to see.

Every module builds a small synthetic model in the browser, computes a real
attribute on it, and lets the reader change the parameters that are normally
left at their defaults. There is no server and no build step. Nothing that
happens inside a module leaves the browser; the only thing recorded is that a
page was opened (see *Page-view counting* below).

---

## The modules

| # | File | AASPI program | Subject |
|---|------|---------------|---------|
| 01 | `modules/sof.html` | `sof3d` | Filtering along structure: mean, alpha-trimmed, median, LUM, principal component; cascading |
| 02 | `modules/edgepreserve.html` | `sof3d` | Kuwahara window selection and the Fehmers–Höecker coherence weighting; s_low, s_high, s_center |
| 03 | `modules/disorder.html` | `disorder` | The 27-point second-difference operator, normalization, and the `stat3d` second stage |
| 04 | `modules/glcm.html` | `glcm3d` | Building the gray-level co-occurrence matrix: quantization, the 1.5σ clip, four directions, sparsity |
| 05 | `modules/textures.html` | `glcm3d` | The eight Haralick measures, and how few of them are independent |
| 06 | `modules/nonparallel.html` | `nonparallelism` | Deviation of vector dip, deviation of energy gradient, and their covariance |

01 and 02 are a pair, and so are 04 and 05 — the second of each opens by
undoing a problem the first one leaves behind. Everything from 02 onward
assumes a dip field and a coherence volume exist, which the first module set
covers. Each module links to the next and to the previous one at the foot of
its reference tabs, so the set can be walked through without returning to the
index.

## Layout

```
index.html          landing page: hero, module cards, About
ADD-COUNTING.md     how the page-view counter is wired, copied from the first set
assets/
  count.js          page-view counting, and nothing else
  seismic.js        SEIS — wavelets, synthetic traces, canvas drawing, colormaps
  attributes.js     ATTR — semblance, dip scans, covariance, eigen, colormaps
  extra.js          EXTRA — everything this set needs that the first one did not
  lab.js            LAB  — model builders, panel layout, tab plumbing, controls
  style.css         the whole visual identity, shared by every page
modules/*.html      one self-contained module per file
```

`seismic.js`, `attributes.js`, `style.css`, `count.js` and `ADD-COUNTING.md`
are copied unchanged from the first repo. **Keep them that way.** If a module
here needs something new, it goes in `extra.js` or `lab.js`; changing a shared
file means the two repos drift and a module copied between them stops working.

`extra.js` holds the algorithms these four programs need — the sof3d filters,
the disorder stencil, the GLCM machinery, the nonparallelism statistics — each
with the AASPI equation it implements written above it in a comment.

`lab.js` holds everything that is scaffolding rather than geophysics: the two
synthetic model builders (`buildSection` for a vertical line, `buildHorizon`
for a map-view surface), gathering along dip, canvas sizing, color bars, the
tab machinery, and control binding. It exists because the six modules here
repeat far more layout code than the first eight did.

Each module is a single HTML file containing its own markup and its own script.
That is deliberate: a module can be copied, emailed, or opened from disk and it
still works, and editing one cannot break another.

## Running it

Open `index.html` in a browser. That is the whole procedure.

Modules also work opened directly from the file system, with one limitation:
shareable-link state is disabled under `file://` because browsers reject
`history.replaceState` there. Everything else behaves identically.

**Shareable links.** Every slider and toggle is written into the querystring as
it moves, so the address bar always holds the current configuration of the
module. Copying it from the address bar hands someone the exact setup, which is
the intended way to distribute a worked example. There is no copy button; the
URL is the feature.

To publish, push to the `gh-pages`-enabled branch. **Push `assets/` whenever a
module changes** — every module depends on `extra.js` and `lab.js`, and a stale
`assets/` is the single most common cause of a module looking broken.
Stylesheets in particular cache hard; if a layout change does not appear, open
`assets/style.css` directly in the browser and check that the change is
actually there before debugging anything else.

## Page-view counting

`assets/count.js` records that a page was opened, and nothing else. It is loaded
by every page — `assets/count.js` from the root, `../assets/count.js` from
`modules/` — as the first script at the foot of the body. `ADD-COUNTING.md`
carries the full procedure and is identical to the copy in the other
repositories.

Counts go to GoatCounter under the account code `hbedle`, shared with the other
teaching repositories served from `hbedle-subsurface.github.io`; the path
distinguishes them, so every module gets its own row at
https://hbedle.goatcounter.com. No cookie is set and no identifier is stored.

The script does not count `file://`, `localhost` or `127.0.0.1`, and honors Do
Not Track. If it fails to load the page carries on unchanged. **Do not modify
those guards, do not add event tracking** — counting page loads is a visitor
log, counting slider moves is watching someone work, and it would contradict
what the site tells people it does — and do not add a second analytics tool.

A new page needs the loader line or it is invisible in the dashboard, which
looks exactly like a page nobody visits.

## How a module is put together

**A sticky lab header** holds whatever the reader needs to keep touching — the
live data panel, the controls, or both. It stays on screen while the panes
below change, because changing a parameter and seeing the answer move is the
entire point and cannot happen if the two are never visible at once.

**Tabs** below it, one pane per step, then `Why it matters`, `Exercises`,
`Key points` and `Method`. Only the visible pane is drawn: a canvas in a hidden
pane has zero width, so anything drawn there comes out at zero size.

**Exercises** carry their answers behind a `<details class="reveal">` toggle
labeled *Hint*, so a reader can try before reading.

**Shared components** live in `style.css`: `.labhead`, `.tabs`, `.tabpane`,
`.stepnav`, `details.reveal`, `.thumb`. Reuse them rather than restyling.

**The tab and control plumbing is in `lab.js`.** `LAB.setupTabs` wires the tab
buttons, the step navigation and the masthead links; `LAB.bindControls` reads
every `[data-key]` element into the state object and restores saved state back
into the widgets. A new module needs neither of those written again.

## Conventions

- **American spelling** throughout: color, center, normalized, gray, meters.
- **Every attribute map gets a color bar** that says what the colors mean. A
  reader should never have to guess whether blue is high or low.
- **Cyclic quantities get cyclic scales.** Nothing in this set is cyclic, but
  the rule stands if one is added.
- **Depth reads the way an interpreter expects**: negative, more negative
  downward, on a datum.
- **Numbers in the prose are measured, not estimated.** If an exercise says an
  attribute reads 0.0402, that value was read out of the running page at the
  settings the exercise describes.
- **One name per module.** The card on `index.html`, the `<title>` and the
  pager links all use the same short name; the `<h1>` is free to be a sentence.
- **One license statement, said once per page.** The module footers carry the
  credit, the license, the citation and the privacy note, identically on all
  six. The landing page says all of that in its About section instead, so its
  footer holds the citation line only — do not paste the module footer there or
  the page says everything twice.
- **Where the measurement contradicts the tidy story, the module says so.**
  Module 02 is the clearest case: overall RMS error and fault preservation
  disagree about which filter is best, and the page presents both numbers and
  names the disagreement rather than quoting whichever one supports edge
  preservation.

## Editing notes

These are the mistakes that have actually been made in these two repos. They
are all silent — the page still renders, it just renders something wrong.

- **Canvas width.** Size canvases to the parent's *content* box, not
  `clientWidth`, which includes padding. A tab pane has 26 px of it, so a
  full-width panel drawn to `clientWidth` overruns its container by 52 px.
  `LAB.panelWidth` and `LAB.rowWidth` do this correctly; use them.
- **Map aspect.** A grid with equal bin spacing in both directions must be drawn
  into a *square* plot box. `LAB.squareMap` enforces it.
- **Fixed axes.** If an axis rescales while a slider moves, the curve stays the
  same size on screen and the change being demonstrated is invisible.
- **Sliders that do nothing.** Measure the response across the slider's full
  range before believing it works. The step-1 statistic in module 01 originally
  reported the dip scan's own search limit rather than a dip in the ground, and
  read 8.00 ms/trace no matter what the model did.
- **Comparisons with one variable too many.** Module 01 step 1 compares a
  horizontal filter against a dip-steered one. Steering it with a dip field
  estimated from the *noisy* data made the steered filter look worse, because
  two things were changing at once. It now uses a dip field from the clean model
  for that one panel, and says so.
- **Metrics that move with what they measure.** An anomaly width defined
  relative to its own depth gets *narrower* as the anomaly is smoothed away.
  Module 02 measures the coherence minimum and the flank steepness instead.
- **Debounced recomputation** means an automated check that reads a value
  immediately after moving a slider will read the old one. Wait for it; the
  modules debounce at 90 ms.
- **A dip volume estimated across a fault is wrong at the fault**, and a
  Kuwahara window steered by it reads from the wrong place. Module 02
  median-filters the dip grid first — the short version of AASPI's
  `filter_dip_components`. Without that step edge preservation measurably makes
  the result worse, which is a real workflow trap and is documented in the
  module rather than quietly patched.

## Sources

The definitions follow the AASPI program documentation for `sof3d`,
`disorder`, `glcm3d` and `nonparallelism`, together with the published
literature — Kuwahara et al. (1976), Fehmers and Höecker (2003), Luo et al.
(2002), Marfurt (2006), Haralick et al. (1973), Barnes (2002), al-Dossary et
al. (2014), Gao (2011), Qi et al. (2014). Every module's **Method** tab lists
its own sources and states plainly where the implementation simplifies or
departs from a production volume.

The largest departure, and it is the same one in all six: these are two
dimensional. There is no crossline direction, so analysis windows are lines of
traces rather than rectangles or ellipses of them, and the one map-view module
works on a single picked surface rather than volumetrically. Every module says
this in its own Method tab and names what specifically is lost.

## License and citation

Free to use for teaching, demonstration, and non-commercial study, provided the
source is credited. Please do not republish or redistribute it, modified or
otherwise, without permission. If you use it in a course or a talk, a credit
line and a link back are all that is asked.

> H. Bedle, *More Geometric Attributes, and How They Actually Work*, University
> of Oklahoma,
> https://hbedle-subsurface.github.io/geometric-attributes-additional/

The same license and citation line appear in the footer of all six module
pages, and in the About section of the landing page. When the SSRN working
paper is published, the link needs adding in eight places: this file, the
landing page, and the citation line in each module footer.

Built for teaching by Heather Bedle, School of Geosciences, University of
Oklahoma, with the AASPI consortium.
