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
| 05 | `modules/textures.html` | `glcm3d` | The eight Haralick measures, how few of them are independent, and how they read on a horizon slice |
| 06 | `modules/nonparallel.html` | `nonparallelism` | Deviation of vector dip, deviation of energy gradient, and their covariance |

01 and 02 are a pair, and so are 04 and 05 — the second of each opens by
undoing a problem the first one leaves behind. Everything from 02 onward
assumes a dip field and a coherence volume exist, which the first module set
covers. Each module links to the next and to the previous one at the foot of
its reference tabs, so the set can be walked through without returning to the
index.

**Shareable links.** Every slider and toggle is written into the querystring as
it moves, so the address bar always holds the current configuration of the
module. Copying it from the address bar hands someone the exact setup, which is
the intended way to distribute a worked example. There is no copy button; the
URL is the feature.

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

## Numbers in the exercise hints

The hints describe what the readouts do rather than quoting them to four
decimal places. A hint says one error is lower than both of its end members, or
that a figure is several times another, or that a matrix is mostly empty — not
that it reads 0.0528.

The reason is maintenance. Change a default window, a noise seed or a model
constant and every quoted decimal somewhere in the set becomes wrong, silently,
with nothing to catch it. Relative statements survive that; exact ones do not.

Exact figures are still used where the arithmetic guarantees them and no model
constant can move them: the number of boxes in an L-level co-occurrence matrix,
the number of pairs a window of a given size supplies, the norm of the disorder
stencil, and the identity between the alpha-trimmed mean at its two end settings
and the mean and the median. Those are properties of the definitions.

## License and citation

*More Geometric Attributes, and How They Actually Work* © 2026 by Heather Bedle
and April Moreno-Ward is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Share it and adapt it for any purpose, including commercially, provided you
credit the source, link to the license, indicate any changes, and license what
you build under the same terms. Full text in [`LICENSE`](LICENSE).

To cite: H. Bedle and A. Moreno-Ward, *More Geometric Attributes, and How They
Actually Work*, University of Oklahoma,
`hbedle-subsurface.github.io/geometric-attributes-additional`.

<!-- TODO before release: replace this block with the SSRN link once the
     companion working paper is posted. Eight places carry it: this file, the
     landing page, and the six module footers. -->
A companion working paper describing the design of this set, its verification
and its limitations is in preparation and will be linked here.

Built for teaching by Dr. Heather Bedle and Dr. April Moreno-Ward, School of
Geosciences, University of Oklahoma, with the AASPI consortium.
