# More Geometric Attributes, and How They Actually Work

Six interactive modules on four AASPI geometric attribute programs, written for
undergraduate geology and geophysics students at the School of Geosciences,
University of Oklahoma, with the [AASPI](https://www.ou.edu/mcee/labs/aaspi)
consortium.

Live at **https://hbedle-subsurface.github.io/geometric-attributes-additional/**

Companion to
[**How Geometric Attributes Actually Work**](https://hbedle-subsurface.github.io/geometric-attributes/),
which covers dip, coherence, curvature and aberrancy. This set takes the
programs that sit alongside those: the filtering that usually runs before them,
and three attributes that respond to properties coherence and curvature do not
measure.

---

## What a student does here

An attribute is normally met as a finished volume. Someone else ran the program
and chose the parameters, and the map either shows the fault or it does not.
These modules work the other way around. Each one builds a small synthetic model
in the browser, computes a real attribute on it, and exposes the parameters that
are usually left at their defaults: the window size, the number of gray levels,
the clip, the dip steering, and the amount of noise.

The model is synthetic on purpose. Because the answer is known, a reader can see
what an attribute does to a feature that is definitely there, and what it does
to one that is not. A reroll button rebuilds the stratigraphy at the same
settings, which is how a reader checks whether a separation they just found is a
property of the attribute or of one particular random seed.

Every module is a sequence of numbered steps, each with its own panels and
readouts, followed by four reference tabs:

- **Why it matters** — how the attribute is used on real data.
- **Exercises** — tasks with a stated purpose and a hint, worked on the page.
- **Key points** — what to carry away.
- **Method** — the equations as implemented, the sources, and a plain statement
  of where this simplifies or departs from a production volume.

No installation, no account, no login. A module page opens from a link and runs.
It works on a phone, though a laptop is easier for the panels that sit side by
side.

## The modules

| # | File | AASPI program | Subject |
|---|------|---------------|---------|
| 01 | `modules/sof.html` | `sof3d` | Filtering along structure: mean, alpha-trimmed, median, LUM, principal component; cascading |
| 02 | `modules/edgepreserve.html` | `sof3d` | Kuwahara window selection and the Fehmers–Höcker coherence weighting; s_low, s_high, s_center |
| 03 | `modules/disorder.html` | `disorder` | The 27-point second-difference operator, normalization, and the `stat3d` second stage |
| 04 | `modules/glcm.html` | `glcm3d` | Building the gray-level co-occurrence matrix: quantization, the 1.5σ clip, four directions, sparsity |
| 05 | `modules/textures.html` | `glcm3d` | The eight Haralick measures, how few of them are independent, and how they read on a horizon slice |
| 06 | `modules/nonparallel.html` | `nonparallelism` | Deviation of vector dip, deviation of energy gradient, and their covariance |

## Using these in a course

**Order and prerequisites.** 01 and 02 are a pair, and so are 04 and 05. The
second of each opens by correcting a problem the first one leaves unresolved, so
assigning one without the other leaves that problem standing. 03 and 06
stand alone and can be dropped into a week on fault and facies interpretation
without the others. Everything from 02 onward assumes a dip field and a
coherence volume exist, which the first module set covers; a class that has not
met dip and coherence should start there.

**Time.** A module is roughly a lab period if the exercises are worked, and
fifteen or twenty minutes if the steps are read through without them. Each
module links to the next and to the previous at the foot of its reference tabs,
so a set can be walked without returning to the index.

**Handing out a worked example.** Every slider and toggle is written into the
querystring as it moves, so the address bar always holds the current
configuration. Copy it and you have handed someone the exact setup — a fault
throw, a window size and a clip that make a particular point. That is the
intended way to distribute a problem, to put a starting state in a lab handout,
or to ask a class to explain what they are looking at. There is no copy button;
the state is held in the address bar.

**Reading a task while working the controls.** The exercises pop out into a
separate window, so a student can keep the task in view rather than tabbing back
and forth to it.

**What the exercises are asking for.** They are written to be worked, not looked
up. Each states why it is worth doing, and the hints describe what should happen
rather than quoting a number: one error lower than both of its end members, a
figure several times another, a matrix mostly empty. A student who reports a
reading that contradicts the hint has either found a real disagreement or
misread a control, and both are worth discussing.

## What is simplified, and what that costs

The definitions follow the AASPI program documentation for `sof3d`, `disorder`,
`glcm3d` and `nonparallelism`, together with the published literature — Kuwahara
et al. (1976), Fehmers and Höcker (2003), Luo et al. (2002), Marfurt (2006),
Haralick et al. (1973), Barnes (2000), Al-Dossary et al. (2014), Gao (2011), Qi
et al. (2014). Every module's **Method** tab lists its own sources.

The largest departure is the same in all six modules. They are two-dimensional.
There is no crossline direction, so analysis windows are lines of traces rather
than rectangles or ellipses of them, and the one map-view module works on a
single picked surface rather than volumetrically. Each Method tab states this
and names what is lost, so a student moving on to a production volume knows
which of these numbers will not carry across.

Two implementation choices in particular differ from a common reading of the
documentation, and are flagged in the Method tabs: the texture quantization
scale is an RMS taken about zero amplitude rather than a standard deviation
about the window mean, and the nonparallelism cross term is built from a
magnitude, so it cannot report anti-correlation.

## Citing and reusing

*More Geometric Attributes, and How They Actually Work* © 2026 by Heather Bedle
and April Moreno-Ward is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Share it and adapt it for any purpose, including commercially, provided you
credit the source, link to the license, indicate any changes, and license what
you build under the same terms. Full text in [`LICENSE`](LICENSE).

Instructors are welcome to assign these directly, translate them, cut them into
a course pack, or take a single step out of a module and put it in a lecture.
No permission is needed. The ShareAlike condition keeps derivative material as
freely available as this material is.

To cite: H. Bedle and A. Moreno-Ward, *More Geometric Attributes, and How They
Actually Work*, University of Oklahoma,
`hbedle-subsurface.github.io/geometric-attributes-additional`.



