# Adding the exercise pop-out to a repository

`assets/popout.js` puts an **Open in new window** button on the exercises tab
of every module. The student gets the exercises in a second window and can read
them while working the controls in the first.

The same file goes in every teaching repository, unchanged. Copy it, add one
script tag per module, run the harness. Nothing else changes — no markup edit,
no stylesheet edit.

---

## 1. Copy the file

Copy `assets/popout.js` from any repository that already has it into
`assets/popout.js` here. Do not edit it. If it needs a change, change it
everywhere.

## 2. Add one script tag per module

In each module, next to the other shared scripts:

```html
<script src="../assets/count.js"></script>
<script src="../assets/popout.js"></script>
<script src="../assets/seismic.js"></script>
<script src="../assets/attributes.js"></script>
```

The path is `assets/popout.js` from a page at the repository root, and
`../assets/popout.js` from a page in `modules/`.

Order does not matter. The script waits for `DOMContentLoaded` and touches
nothing but the exercises pane.

## 3. What the module has to provide

Two things, both already true of every module built to the house template:

- the exercises pane is `<section class="tabpane" id="pe">`
- the pane's first `<h3>` is its heading

If either is missing, the button does not appear and the page is otherwise
untouched. That is the intended failure: a module with a stale or missing
`assets/` loses the button and keeps the exercises tab. No module carries a
local fallback copy for this reason.

## 4. Check it

Run the harness against every module:

```bash
for m in modules/*.html; do
  printf "%-24s " "$(basename $m)"
  node harness-popout.js "$m" | tail -1
done
```

Every module should report all checks passing. The harness confirms the button
is injected, the click opens a per-module window, the written document links
the stylesheet by absolute URL, and every exercise and hint is copied across.

Then open one module in a browser and click the button. Check that the pop-out
inherits the site's fonts and colors, that the **Hint** toggles still open, and
that a second module opens its own window rather than replacing the first.

## 5. What it does and does not do

**Does:** copies the exercise text that is already on the page into a second
window, styled by the same stylesheet.

**Does not:** fetch anything, send anything, store anything, or set a cookie.
It works from a `file://` copy with no network, which is the case that matters
when a student is working from a downloaded folder or an instructor is offline
during a lecture.

The pop-out is a copy taken at the moment the button is clicked. Moving a
slider in the main window does not change it, and the pop-out says so in a
line at the bottom. The exercise text is static, so there is nothing to keep in
sync.

## 6. Browser notes

- The window is opened by a click, so ordinary pop-up blocking does not apply.
  If a blocker refuses anyway, the button says so in place for a few seconds
  and then resets, rather than failing silently.
- Printing the pop-out expands the **Hint** reveals, so an instructor can print
  the exercises with the answers.
