# Adding the control pop-out to a repository

`assets/panelout.js` puts an **Open the controls in a second window** button on
the panel at the top of every module. The student gets the sliders in a second
window and can put them beside the panels they drive, instead of scrolling
between the two.

This is the companion to `assets/popout.js`, which does the same for the
exercises. That one is a copy taken at the moment of the click, because
exercise text does not change. This one is live in both directions: the second
window holds a working copy of the panel, every move in it drives the module in
the first window, and what the module draws is copied back.

The same file goes in every teaching repository, unchanged. Copy it, add one
script tag per module, run the harness. Nothing else changes — no markup edit,
no stylesheet edit.

---

## 1. Copy the file

Copy `assets/panelout.js` from any repository that already has it into
`assets/panelout.js` here. Do not edit it. If it needs a change, change it
everywhere.

## 2. Add one script tag per module

In each module, after the module's own scripts:

```html
<script src="../assets/seismic.js"></script>
<script src="../assets/attributes.js"></script>
<script src="../assets/extra.js"></script>
<script src="../assets/lab.js"></script>
<script src="../assets/panelout.js"></script>
```

The path is `assets/panelout.js` from a page at the repository root, and
`../assets/panelout.js` from a page in `modules/`.

Order does not matter. The script waits for `DOMContentLoaded` and touches
nothing but the panel.

## 3. What the module has to provide

One thing, already true of every module built to the house template: the panel
is `<div class="labhead">`, with the sliders inside it.

A set that lays its controls out as a band under the title rather than as a
sticky lab head is also handled: the script falls back to
`<section class="controls">`. Where the panel has a `.cap` caption line, the
button is placed at the end of it; where it has none, a short row is built
directly above the panel to hold the button. That is the only difference
between one set and another, and it is decided by the script rather than by
the module.

If no panel is found the button does not appear and the page is otherwise
untouched. That is the intended failure: a module with a stale or missing
`assets/` loses the button and keeps its controls where they always were. No
module carries a local fallback copy for this reason.

## 4. Check it

Run the harness against every module:

```bash
for m in modules/*.html; do
  printf "%-24s " "$(basename $m)"
  node dev/harness-panelout.js "$m" | tail -1
done
```

Every module should report all checks passing. The harness confirms the button
is injected and survives the stylesheet rule that hides buttons inside the
panel, that the click opens a per-module window, that the copy matches the
panel element for element, that a slider moved in the copy reaches the module,
that a menu and a readout changed by the module reach the copy, and that
closing the window puts the panel back in the page.

Then open one module in a browser and click the button. Check that the second
window inherits the site's fonts and colors, that dragging a slider there moves
the panels in the first window, that the header canvas in the copy follows what
the module draws, and that closing the window leaves the module drawing at full
width.

## 5. What it does and does not do

**Does:** clones markup that is already on the page into a second window and
forwards events between the two.

**Does not:** fetch anything, send anything, store anything, or set a cookie.
It works from a `file://` copy with no network, which is the case that matters
when a student is working from a downloaded folder or an instructor is offline
during a lecture.

The copy's inputs are not the module's inputs. When one of them moves, its
value is copied onto the real input in the first window and an ordinary `input`
event is fired there. Every module already listens for that event, which is why
no module needs a line of code for any of this. Buttons in the copy call
`click()` on their counterpart, and a press on a copied canvas is forwarded to
the real one at the same fractional position, so a module that lets the
analysis point be dragged across the section still works from the second
window.

A timer running at 120 ms copies text, classes, canvas bitmaps, and the hidden,
disabled and selected states back from the panel to the copy. The states matter
as much as the text: a module that swaps one set of sliders for another does it
with the `hidden` property, and a menu carries its state as a property rather
than as an attribute, so neither would survive the clone on its own.

The panel is not removed from the page while the window is open. It is moved
into a wrapper of zero height, because a module measures the width of its
canvases from the panel's parent and an element that is `display: none` has no
width to measure. A line takes its place on the page with a button that brings
it back, and closing the second window brings it back as well.

## 6. Browser notes

- The window is opened by a click, so ordinary pop-up blocking does not apply.
  If a blocker refuses anyway, the button says so in place for a few seconds
  and then resets, rather than failing silently.
- Closing the module window leaves the second window standing with controls
  that no longer drive anything. It says so in a line at the bottom rather than
  looking live.
- A step that hides the panel dims the copy to match, so a stale copy is not
  mistaken for a live one.
