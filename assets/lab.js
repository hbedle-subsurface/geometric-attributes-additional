/* ===========================================================================
   lab.js — the parts every module in this set needs
   "More Geometric Attributes, and How They Actually Work"
   Heather Bedle and April Moreno-Ward / AASPI / University of Oklahoma

   Two kinds of thing live here.

   MODELS. A synthetic section and a synthetic horizon, both with the same
   ingredients: folded reflectors, a fault, a chaotic package, a channel, and
   noise you can turn up. Six modules teaching six attributes on six different
   models would make the attributes look unrelated, when the point of the set
   is that they are all measurements of the same piece of ground.

   SCAFFOLDING. Tab wiring, step navigation, canvas sizing, square map panels
   and color bars. Every module was writing its own copy of these and they were
   drifting apart.
   =========================================================================== */

const LAB = (function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (id) => document.getElementById(id);

  /* =======================================================================
     LOUD FAILURE

     A module that cannot find its libraries should say so on the page. A blank
     white rectangle where a seismic section belongs is not a message.
     ======================================================================= */

  function guard(needed) {
    /* A top-level `const` in a classic <script> creates a binding in the global
       LEXICAL scope, not a property of `window`. So `window.SEIS` is undefined
       even when seismic.js loaded perfectly. Every library here is declared
       that way, and lab.js is evaluated after all of them in the same global
       scope, so the honest test is a plain `typeof` on the identifier - which
       is safe on an undeclared name and returns 'undefined' if the file really
       is missing. */
    const present = {
      SEIS: typeof SEIS !== 'undefined',
      ATTR: typeof ATTR !== 'undefined',
      EXTRA: typeof EXTRA !== 'undefined',
      LAB: true,
    };
    const missing = needed.filter((n) => !present[n]);
    if (!missing.length) return true;
    const files = missing.map((n) => ({
      SEIS: 'assets/seismic.js', ATTR: 'assets/attributes.js',
      EXTRA: 'assets/extra.js', LAB: 'assets/lab.js',
    }[n] || n));
    const el = document.createElement('div');
    el.setAttribute('style', 'background:#841617;color:#fff;padding:14px 18px;margin:16px 0;'
      + 'font:13px/1.6 ui-monospace,Menlo,monospace');
    el.textContent = 'This module could not load ' + files.join(' and ')
      + '. It expects them one directory up, at ../assets/, and file names are '
      + 'case-sensitive on GitHub Pages.';
    const w = document.querySelector('.wrap');
    (w || document.body).insertBefore(el, w ? w.firstChild : null);
    return false;
  }

  /* =======================================================================
     THE SECTION MODEL

     A vertical slice: nx traces by nt samples. Reflectivity is built first as
     a set of horizons, each a depth in samples at every trace, then convolved
     with a wavelet.

     cfg fields, all optional:
       nx, nt, dt      geometry            (default 180 x 260, 2 ms)
       freq            wavelet, Hz         (default 30)
       reflGap         average gap between reflectors, in samples (default
                       14). This is the number that decides whether a fault
                       reads as a plane or as a staircase; see THE REFLECTORS
                       below
       nRefl           a fixed reflector count, overriding reflGap
       spacingJitter   0-0.6, how uneven the reflector spacing is
       firstRefl       depth of the shallowest reflector, as a fraction of nt
       lastRefl        depth of the deepest one

     Each horizon returned in `horizons` carries t, a depth in samples at every
     trace, and cut, a flag marking the traces where the fault has removed that
     reflector. t still holds a depth there - the depth of the plane - so
     anything snapping a window to the nearest horizon still gets an answer.
       fold            relief of the fold, in samples
       foldWidth       how wide the fold is, as a fraction of the section. A
                       narrow fold gives steep flanks without translating the
                       whole section off the bottom of the display, which is
                       what a regional tilt does once it is steep enough to be
                       worth looking at
       throw           fault throw, in samples; 0 removes the fault
       faultAt         where the fault crosses mid-section, as a fraction of nx
       faultDipDeg     dip of the fault plane as it will be DRAWN, in degrees
                       from horizontal. 90 is vertical; the default 65 is a
                       fairly ordinary normal fault. This is the dip in the
                       ground; what it looks like on a panel follows from the
                       vertical exaggeration of that panel
       vel             interval velocity, m/s, used only to place the fault
                       plane and to report distances (default 2800)
       binM            trace spacing in m, used the same way (default 12.5)
       chaos           0-1, how disordered the middle package is
       chaosTop/Bot    sample range of the chaotic package
       noise           0-1, random noise as a fraction of peak amplitude
       spike           0-1, fraction of samples that get an isolated spike
       coherent        0-1, cross-cutting linear noise (migration artifacts)
       seed            reproducibility
     ======================================================================= */

  function buildSection(cfg) {
    const c = Object.assign({
      nx: 180, nt: 260, dt: 0.002, freq: 30,
      reflGap: 14, nRefl: 0, spacingJitter: 0.22, firstRefl: 0.07, lastRefl: 0.94,
      vel: 2800, binM: 12.5,
      fold: 16, foldWidth: 0.24, throw: 0, faultAt: 0.52, faultDipDeg: 65,
      chaos: 0, chaosTop: 0.34, chaosBot: 0.56,
      noise: 0, spike: 0, coherent: 0, seed: 7,
      channel: 0, channelAt: 0.30,
    }, cfg || {});

    const nx = c.nx, nt = c.nt;
    const rnd = SEIS.mulberry32(c.seed);
    const wav = SEIS.makeWavelet({ type: 'ricker', f: c.freq });
    /* THE FAULT PLANE
       Real normal faults are not vertical, and drawing one that way teaches a
       picture nobody sees on a section. The plane is specified by the dip it
       should APPEAR to have on screen, which is what a reader judges it by, so
       the conversion has to go through the aspect ratio the section is drawn
       at rather than through samples and traces directly.

       A plane at theta degrees runs 1/tan(theta) horizontally for every 1
       vertically, and that ratio is converted into traces per sample below.
       The position is kept as a float: rounding it to a whole trace at each
       depth is one way to produce a staircase.

       The dip is a dip in the ground, not a dip on the screen. Getting there
       needs two numbers the model otherwise has no use for: the interval
       velocity, which turns a sample of two-way time into a thickness of rock,
       and the bin spacing, which turns a trace into a distance along the line.
       With both in hand a plane at theta runs

         (dt * v / 2) / (tan(theta) * bin)

       traces sideways for every sample of depth, and that is the whole
       conversion. The earlier version had no velocity, so it guessed at the
       shape of the panel the fault would be drawn on and tuned the plane to
       look right there. Tuned to a square panel and drawn on the wide locator
       banner, a 65 degree plane came out at about 41, which stretched the
       distance between reflector terminations by a factor of three and put the
       stairs back on the panel a reader looks at first.

       Doing it physically also makes the drawn dip a consequence rather than a
       setting. A section is nearly always vertically exaggerated, so a fault
       drawn on one is steeper than the fault in the ground, and the amount
       depends on the panel. Fault dips read off a section are too steep for
       exactly this reason, which is worth a student knowing.

       None of this is what made the fault read as a staircase in the first
       place. Nothing on a section draws the plane; what a reader sees is the
       set of points where reflectors terminate against it, and the eye joins
       those points only if they are close enough together. The spacing between
       them is the reflector spacing times the slope above. With reflectors two
       dozen samples apart the terminations land seven or eight traces apart
       with a flat segment of reflector between each pair, and the eye follows
       the flat segments instead. Three things fix it together: reflectors
       close enough that the terminations join into a line, a block rule that
       puts each termination on the plane instead of up-dip of it, and a slope
       that is not three times too shallow. */
    const fx0 = c.faultAt * nx;              // where it crosses mid-section
    const theta = Math.max(20, Math.min(90, c.faultDipDeg)) * Math.PI / 180;
    // traces of horizontal run per sample of depth
    const faultSlope = (c.dt * c.vel / 2) / (Math.tan(theta) * c.binM);
    // the plane dips toward increasing trace, so the hanging wall on the right
    // is the side that drops - an ordinary normal fault
    const faultXAt = (z) => fx0 + faultSlope * (z - nt / 2);
    /* The same plane read the other way: the depth at which it crosses a given
       trace. The plane runs down toward increasing trace, so a point is on the
       right-hand side of it exactly when it is shallower than this. The
       right-hand side is the hanging wall, and the hanging wall is what
       drops. */
    const tCross = (ix) => nt / 2 + (ix - fx0) / faultSlope;
    const fx = Math.round(fx0);

    /* THE REFLECTORS

       Spacing controls whether the fault reads as a plane, for the reason
       given above, so it is set from a target gap rather than from a fixed
       list. Reflectors are spread over the section between firstRefl and
       lastRefl at an average of reflGap samples apart, and spacingJitter
       varies the gaps so the section is a stratigraphic column rather than a
       comb. An even comb has a second problem: every gap is the same, so a
       throw close to one gap lines each reflector up with its neighbor's
       position across the fault and the offset stops being readable.

       Two limits bracket the useful spacing. Gaps much wider than the throw
       put the terminations too far apart and bring the stairs back. Gaps
       narrower than the throw let a reflector on the downthrown side line up
       with the one above it, which is a cycle skip and reads as a mismatch
       rather than an offset. Between them, terminations are dense enough to
       join into a line and each offset is still less than one gap.

       Positions are in samples and the section is dt seconds per sample, so
       the default 14-sample gap is 28 ms at 2 ms sampling, against a 33 ms
       Ricker period: reflectors interfere the way they do on real data
       instead of standing alone. It also sets the ceiling on the throw
       sliders, which are held at 10 samples in the modules for the
       cycle-skip reason above. */
    const HZ = [];
    /* The count follows from the gap rather than the other way round, so a
       module that chooses a different nt gets reflectors the same distance
       apart in time instead of the same number of them squeezed into a
       shorter section. c.nRefl overrides it if a module needs a fixed count. */
    const nRefl = Math.max(4, Math.round(
      c.nRefl || (c.lastRefl - c.firstRefl) * nt / c.reflGap + 1));
    const jit = clamp(c.spacingJitter, 0, 0.6);
    // its own random stream, so changing the stratigraphy does not change the
    // noise or spike patterns a module was built to show
    const srnd = SEIS.mulberry32(c.seed + 3);
    /* The chaotic package needs its own fields. Two sine terms, which is what
       this used to use, wobble every reflector in the package the same way,
       so the package came out with a visible fabric running through it: the
       reflectors were displaced but still parallel to each other, which is
       the one thing a chaotic package is not. Sampling a smooth random field
       at a different offset for each reflector decorrelates them, and cutting
       reflectors out at random gives the terminations that make a mass
       transport deposit look the way it does. */
    const crnd = SEIS.mulberry32(c.seed + 71);
    const Vc1 = valueField(crnd, Math.max(nx, nt), 9);
    const Vc2 = valueField(crnd, Math.max(nx, nt), 3.5);
    const Vcut = valueField(crnd, Math.max(nx, nt), 4.5);
    const gaps = [];
    let gsum = 0;
    for (let h = 0; h < nRefl - 1; h++) {
      const g = 1 - jit + 2 * jit * srnd();
      gaps.push(g); gsum += g;
    }
    const span = c.lastRefl - c.firstRefl;
    const base = [];
    let u = c.firstRefl;
    for (let h = 0; h < nRefl; h++) {
      base.push(Math.round(u * nt));
      if (h < nRefl - 1) u += span * gaps[h] / gsum;
    }
    /* Polarity alternates. Reflection strength does not: a column of equal
       reflectors is the other thing that makes an offset hard to read, since
       every reflector across the fault looks like every other one. Alternating
       polarity is kept because several modules seed a horizon tracker on a
       peak and need one within a few samples of any depth. */
    const RC = [];
    for (let h = 0; h < base.length; h++) {
      RC.push((h % 2 ? -1 : 1) * (0.45 + 0.55 * srnd()));
    }
    // the reflector nearest mid-section, for anything that wants one horizon
    let chH = 0, chD = 1e9;
    for (let h = 0; h < base.length; h++) {
      const d = Math.abs(base[h] - nt / 2);
      if (d < chD) { chD = d; chH = h; }
    }
    for (let h = 0; h < base.length; h++) {
      const t = new Float32Array(nx);
      // 1 where the fault has removed this reflector from this trace
      const cut = new Uint8Array(nx);
      const inChaosPkg = base[h] >= c.chaosTop * nt && base[h] <= c.chaosBot * nt;
      for (let ix = 0; ix < nx; ix++) {
        const u = ix / (nx - 1);
        // a broad fold plus a gentle regional dip, both decreasing with depth
        // so the section shows growth rather than a stack of parallel copies
        const grow = 0.5 + 0.5 * (h / (base.length - 1));
        let z = base[h]
          - c.fold * grow * Math.exp(-Math.pow((u - 0.42) / c.foldWidth, 2))
          + 10 * grow * (u - 0.5);
        if (c.throw) {
          /* The hanging wall moves as a rigid body, so a reflector belongs to
             it only if its position AFTER the throw is still on the hanging-
             wall side of the plane, and to the footwall only if its position
             BEFORE the throw is already on the other side. A reflector that
             fails both tests is not in either block: the fault has cut it out.

             That missing interval is what keeps the fault trace straight, and
             leaving it out is what bent it. Deciding the side at the
             undisplaced depth alone puts every hanging-wall termination
             up-dip of where the plane actually is by throw times the slope,
             so the terminations zigzag across the plane instead of lying on
             it. A normal fault omits section; this is that omission. */
          const tc = tCross(ix);
          const moved = z + c.throw;
          if (moved < tc) z = moved;             // dropped with the hanging wall
          else if (z <= tc) { cut[ix] = 1; z = tc; }   // cut out by the fault
          // else: footwall, and it stayed where it was
        }
        if (inChaosPkg && c.chaos > 0) {
          /* Each reflector reads the field at its own offset, so the package
             loses its internal parallelism rather than being folded as a
             unit. The last term keeps a little trace-to-trace roughness. */
          const yo = h * 23 + 5;
          z += c.chaos * (9.0 * fieldAt(Vc1, ix, yo)
                        + 5.0 * fieldAt(Vc2, ix, yo * 1.7)
                        + 2.0 * (rnd() * 2 - 1));
          // and it breaks: reflectors inside a chaotic package terminate
          if (fieldAt(Vcut, ix, yo * 2.3) > 1.05 - 0.75 * c.chaos) cut[ix] = 1;
        }
        t[ix] = z;
      }
      HZ.push({ t: t, cut: cut, rc: RC[h], chaotic: inChaosPkg });
    }

    // --- reflectivity, then the trace ------------------------------------
    const f = new Float32Array(nx * nt);
    const chX = Math.round(c.channelAt * nx);
    for (let ix = 0; ix < nx; ix++) {
      const spikes = [];
      for (let h = 0; h < HZ.length; h++) {
        let r = HZ[h].rc * 0.12;
        if (HZ[h].chaotic && c.chaos > 0) {
          // amplitude in a chaotic package is erratic too, not just its time
          r *= 1 - 0.75 * c.chaos * rnd();
        }
        // a channel: one horizon goes quiet over a band of traces
        if (c.channel > 0 && h === chH) {
          const d = Math.abs(ix - chX);
          const inside = 1 / (1 + Math.exp((d - 13) / 2.2));
          r *= 1 - c.channel * inside;
        }
        if (HZ[h].cut[ix]) continue;   // the interval the fault removed
        spikes.push({ t: HZ[h].t[ix] * c.dt, r: r });
      }
      f.set(SEIS.traceFromSpikes(spikes, 0, c.dt, nt, wav), ix * nt);
    }

    // --- what makes it hard to interpret ---------------------------------
    let peak = 1e-9;
    for (let i = 0; i < f.length; i++) peak = Math.max(peak, Math.abs(f[i]));

    if (c.noise > 0) {
      const n = SEIS.bandLimitedNoise(nx, nt, c.dt, wav, c.seed + 91, 1);
      for (let i = 0; i < f.length; i++) f[i] += c.noise * peak * 1.35 * n[i];
    }
    if (c.spike > 0) {
      // isolated bad samples: the thing a mean filter smears and a median kills
      for (let ix = 0; ix < nx; ix++) {
        for (let it = 0; it < nt; it++) {
          if (rnd() < c.spike * 0.05) {
            f[ix * nt + it] += (rnd() < 0.5 ? -1 : 1) * peak * (1.6 + 2.4 * rnd());
          }
        }
      }
    }
    if (c.coherent > 0) {
      // steep cross-cutting events, the migration-alias kind of noise the
      // disorder documentation describes on the Halten Terrace horizon
      for (let ix = 0; ix < nx; ix++) {
        for (let it = 0; it < nt; it++) {
          const a = Math.sin((ix * 1.9 + it * 0.85) * 0.36)
                  + 0.7 * Math.sin((ix * -2.4 + it * 0.9) * 0.29);
          f[ix * nt + it] += c.coherent * peak * 0.42 * a;
        }
      }
    }

    let pk = 1e-9;
    for (let i = 0; i < f.length; i++) pk = Math.max(pk, Math.abs(f[i]));
    return {
      f: f, nx: nx, nt: nt, dt: c.dt, peak: pk, horizons: HZ, wav: wav,
      // where the fault crosses mid-section, for anything that wants one number
      faultX: fx,
      // and where it crosses any given sample, for anything that should not
      // pretend a dipping plane sits at one trace
      faultXAt: faultXAt,
      // and the reverse, the depth at which it crosses a given trace
      tCross: tCross,
      faultSlope: faultSlope,
    };
  }

  /* =======================================================================
     THE MAP-VIEW MODEL

     An amplitude extraction along a picked horizon: ng by ng bins of
     reflection strength, the thing an interpreter actually looks at when they
     run a texture volume and slice it. The vertical-section model is the wrong
     shape for this. A texture attribute on a section is measuring the pattern
     the wavelet makes, and on a horizon slice it is measuring the pattern the
     geology makes, which is the reason the attributes were brought into
     seismic interpretation in the first place.

     Four facies, each with a texture rather than just a brightness, because a
     texture attribute cannot see brightness:

       background    smooth, slowly varying - conformable section
       chaotic body  fine random speckle - salt, or a mass transport complex
       channel       banded ACROSS its axis and smooth along it, so it is
                     anisotropic: the point of counting more than one direction
       fault         a narrow dim lineament

     Amplitudes come out roughly on 0 to 1. Nothing here is a wave equation;
     it is four patterns arranged so the eight measures have something to
     disagree about.
     ======================================================================= */

  /* =======================================================================
     A MAP-VIEW SLICE

     Four facies on one amplitude extraction: conformable background, a chaotic
     body, a channel, and a fault lineament. The point of the map is that the
     four are close to the same brightness, so amplitude alone will not
     separate them and something has to be said about their texture instead.

     Everything here is built out of correlated random fields rather than out
     of white noise, and that is not decoration. Uncorrelated noise has the
     same statistics at every lag, so a body made of it is not a facies, it is
     the noise slider drawn inside a circle. Real chaotic intervals are made of
     blocks and clasts at some size, and the thing that separates a chaotic
     facies from noisy data on real seismic is that the chaos has a scale and
     the noise does not. A model in which the two are identical cannot teach
     the distinction that matters most.
     ======================================================================= */

  /* Value noise: random numbers on a coarse lattice, smoothly interpolated
     between. cell is the lattice spacing in bins, so it sets the size of the
     features. Two or three of these at different cell sizes give a field that
     looks like rock rather than like static. */
  function valueField(rnd, ng, cell) {
    const nc = Math.ceil(ng / cell) + 3;
    const g = new Float32Array(nc * nc);
    for (let i = 0; i < nc * nc; i++) g[i] = rnd() * 2 - 1;
    return { nc: nc, cell: cell, g: g };
  }

  function fieldAt(V, x, y) {
    const fx = x / V.cell + 1, fy = y / V.cell + 1;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    // smoothstep, so the interpolation has no visible lattice creases
    const ex = fx - i0, ey = fy - j0;
    const tx = ex * ex * (3 - 2 * ex), ty = ey * ey * (3 - 2 * ey);
    const at = (i, j) => V.g[clamp(j, 0, V.nc - 1) * V.nc + clamp(i, 0, V.nc - 1)];
    const a = at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx;
    const b = at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  }

  function buildSlice(cfg) {
    const c = Object.assign({
      ng: 72, bin: 25, seed: 5, noise: 0.10,
      chaosR: 0.19, chaos: 1, channel: 1, fault: 1,
      // where each feature sits, as fractions of the grid, so a caller that
      // wants an unmemorable map can move them
      chaosAt: [0.64, 0.66], channelAt: 0.26, faultAt: 0.86,
    }, cfg || {});
    const ng = c.ng, N = ng * ng;
    const rnd = SEIS.mulberry32(c.seed);
    const a = new Float32Array(N);
    const facies = new Uint8Array(N);

    // background fabric, two scales; chaotic interior; and a field used only
    // to make the outline of the chaotic body irregular
    const Vb1 = valueField(rnd, ng, 7.0);
    const Vb2 = valueField(rnd, ng, 3.2);
    const Vb3 = valueField(rnd, ng, 1.5);
    const Vc1 = valueField(rnd, ng, 3.6);
    const Vc2 = valueField(rnd, ng, 1.8);
    const Vr = valueField(rnd, ng, 5.0);
    const Vk = valueField(rnd, ng, 4.0);      // irregularity in the channel bars

    const bcx = ng * c.chaosAt[0], bcy = ng * c.chaosAt[1];   // the chaotic body
    const faultXAtY = (y) => ng * c.faultAt + 4 * Math.sin(y * 0.10);
    const SLIP = 3.2;                          // bins of apparent offset

    /* Conformable background: a long-wavelength structural component with a
       shorter-wavelength depositional fabric on top of it. The fabric is what
       stops the background from being perfectly predictable, which it was in
       an earlier version of this model and which made every anomaly separable
       by construction. */
    function background(x, y) {
      const u = x / (ng - 1), v = y / (ng - 1);
      return 0.55
        + 0.09 * Math.sin(2 * Math.PI * 1.15 * u + 0.6)
        + 0.06 * Math.cos(2 * Math.PI * 0.85 * v - 0.3)
        + 0.035 * Math.sin(2 * Math.PI * 0.6 * (u + v))
        + 0.055 * fieldAt(Vb1, x, y)
        + 0.042 * fieldAt(Vb2, x, y)
        + 0.125 * fieldAt(Vb3, x, y);
    }

    for (let iy = 0; iy < ng; iy++) {
      for (let ix = 0; ix < ng; ix++) {
        const i = iy * ng + ix;

        /* The fault first, because it moves the rock. A fault on a horizon
           slice juxtaposes one part of the section against another, so the
           amplitude pattern on the far side is displaced rather than merely
           dimmed. Sampling the background at a shifted position on one side
           is that displacement. Dimming alone, which is what this model used
           to do, makes a fault a dark line drawn over an undisturbed map. */
        const fx = faultXAtY(iy);
        const shifted = c.fault > 0 && ix > fx;
        let amp = background(ix, shifted ? iy + SLIP : iy);

        // a channel, meandering, with accretion banding across its axis
        if (c.channel > 0) {
          const u = ix / (ng - 1);
          const cy = ng * (c.channelAt + 0.035 * Math.sin(u * 6.5) + 0.012 * Math.sin(u * 15.7 + 1.1));
          const halfW = ng * 0.060 * (1 + 0.22 * Math.sin(u * 9.1 + 0.4));
          const d = (iy - cy) / halfW;
          if (Math.abs(d) < 1) {
            facies[i] = 2;
            /* Bars are set by distance across the axis, sheared along it so
               they sit oblique rather than square, and spaced irregularly.
               The spacing is about four bins, which at 25 m is a hundred
               metres and is a plausible size for accretion sets. An earlier
               version banded the channel at a period of under three bins,
               close to the sampling limit of the grid, which gave a directional
               contrast ratio near seven. That number was a property of the
               sinusoid rather than of the channel. With bars at a realistic
               spacing and a sinuous outline the ratio is closer to two, and
               most of what remains comes from the margins of the channel
               rather than from the bars inside it. */
            const phase = d * 2.2 + (ix / (ng - 1)) * 4.0 + 0.55 * fieldAt(Vk, ix, iy);
            const bar = Math.sin(phase * Math.PI);
            // gradational margins, so the edge is not a cliff
            const taper = Math.min(1, (1 - Math.abs(d)) * 3.2);
            const fill = 0.76 + 0.17 * c.channel * bar + 0.04 * Math.sin(ix * 0.17);
            amp = amp * (1 - taper) + taper * fill;
          }
        }

        // the chaotic body: correlated at the scale of a block, with a ragged
        // outline and a few brighter clasts in it
        if (c.chaosR > 0) {
          const th = Math.atan2(iy - bcy, ix - bcx);
          const wobble = 1 + 0.20 * fieldAt(Vr, ix, iy) + 0.07 * Math.sin(th * 3.1);
          const r = Math.hypot(ix - bcx, iy - bcy) / (c.chaosR * ng * wobble);
          if (r < 1) {
            facies[i] = 1;
            const edge = Math.min(1, (1 - r) * 4);
            let ch = 0.52
              + 0.26 * fieldAt(Vc1, ix, iy)
              + 0.20 * fieldAt(Vc2, ix, iy);
            // clasts: a few small bright blocks, which is what makes a
            // chaotic interval chaotic rather than merely noisy
            const k = fieldAt(Vc2, ix + 31, iy + 17);
            if (k > 0.55) ch += 0.20;
            amp = amp * (1 - edge) + edge * (0.5 + (ch - 0.5) * c.chaos);
          }
        }

        // the lineament itself: poor data along the plane
        if (c.fault > 0 && Math.abs(ix - fx) < 1.1) {
          facies[i] = 3;
          amp *= 1 - 0.6 * c.fault;
        }

        a[i] = amp;
      }
    }

    /* Acquisition noise, added last and uncorrelated, which is the whole
       difference between it and the chaotic body above. */
    if (c.noise > 0) {
      for (let i = 0; i < N; i++) a[i] += c.noise * 0.30 * (rnd() * 2 - 1);
    }
    return { ng: ng, bin: c.bin, a: a, facies: facies };
  }


  /* =======================================================================
     THE HORIZON MODEL

     A map view: ng by ng bins carrying depth, reflection strength, and the two
     dip components that follow from the depth surface. Everything the map-view
     modules need, computed once.

     cfg: ng, bin (m), fold, faults, chaos, channel, noise, seed
     ======================================================================= */

  function buildHorizon(cfg) {
    const c = Object.assign({
      ng: 96, bin: 25, fold: 60, throwM: 0, chaos: 0,
      channel: 0, noise: 0, seed: 11, saltR: 0,
    }, cfg || {});
    const ng = c.ng, N = ng * ng;
    const rnd = SEIS.mulberry32(c.seed);
    const z = new Float32Array(N);        // depth, negative downward
    const a = new Float32Array(N);        // reflection strength
    const facies = new Uint8Array(N);     // 0 background 1 chaos 2 channel 3 fault

    const cx = ng * 0.62, cy = ng * 0.44;
    /* Fields for the chaotic body, replacing two sine terms that laid a
       regular cross-hatch over it. A pattern that repeats is the opposite of
       what the word chaotic is doing in the name. */
    const hrnd = SEIS.mulberry32(c.seed + 91);
    const Vh1 = valueField(hrnd, ng, 6.0);
    const Vh2 = valueField(hrnd, ng, 2.4);
    for (let iy = 0; iy < ng; iy++) {
      for (let ix = 0; ix < ng; ix++) {
        const i = iy * ng + ix;
        const u = (ix - ng * 0.34) / (ng * 0.24), w = (iy - ng * 0.56) / (ng * 0.34);
        // z is negative downward, so a structural high is the LESS negative
        // value: the dome has to be added, not subtracted
        let d = c.fold * Math.exp(-0.5 * (u * u + w * w))         // a dome
                + 0.22 * c.fold * (ix / ng)                       // regional dip
                + 12 * Math.sin(iy * 0.11);                       // a gentle roll
        let amp = 1;

        /* A normal fault, running north-south. Its trace is close to
           straight: a fault is a plane cutting a surface, so where it meets a
           horizon it is a line, bending only where the surface is not flat or
           where segments step. It used to be given four bins of sinusoidal
           sway, which made it look exactly like the channel below and left
           two features on the map that a reader could not tell apart. The
           difference between them is now the difference it is on real data:
           the fault is straight and offsets the surface, the channel meanders
           and does not. */
        const fx = ng * 0.30 + 0.11 * (iy - ng * 0.5) + 0.9 * Math.sin(iy * 0.045);
        if (c.throwM && ix > fx) d += c.throwM;
        if (c.throwM && Math.abs(ix - fx) < 1.2) facies[i] = 3;

        // a chaotic package: salt, or a mass transport complex
        if (c.saltR > 0) {
          const r = Math.hypot(ix - cx, iy - cy) / (c.saltR * ng);
          if (r < 1) {
            facies[i] = 1;
            const taper = 1 - r * r;
            d += c.chaos * taper * (14 * fieldAt(Vh1, ix, iy)
                                  + 9 * fieldAt(Vh2, ix, iy)
                                  + 5 * (rnd() * 2 - 1));
            // Amplitudes inside are poor and fairly uniform, and climb steeply
            // back to normal at the rim - which is how salt and a mass
            // transport complex behave, and why an attribute built on the
            // amplitude gradient finds the boundary rather than the interior.
            amp *= 0.30 + 0.70 * Math.pow(r, 6);
          }
        }

        /* A channel: dim fill, no structural expression at all. It runs
           roughly east-west, across the fault rather than beside it, which is
           the second half of keeping the two features distinguishable. A
           channel that crosses a fault is also the more useful picture: it
           shows a reader that the two are different kinds of thing rather
           than two versions of the same lineament. */
        if (c.channel > 0) {
          const chy = ng * 0.76 + 7 * Math.sin(ix * 0.085) + 3.5 * Math.sin(ix * 0.21 + 1.3);
          const dd = Math.abs(iy - chy);
          const inside = 1 / (1 + Math.exp((dd - 4.5) / 1.1));
          if (inside > 0.5) facies[i] = 2;
          amp *= 1 - c.channel * inside;
        }

        z[i] = d; a[i] = amp;
      }
    }
    if (c.noise > 0) {
      for (let i = 0; i < N; i++) {
        z[i] += c.noise * 9 * (rnd() * 2 - 1);
        a[i] += c.noise * 0.35 * (rnd() * 2 - 1);
      }
    }

    // dip components from the surface, in meters per meter
    const p = new Float32Array(N), q = new Float32Array(N);
    const at = (g, x, y) => g[clamp(y, 0, ng - 1) * ng + clamp(x, 0, ng - 1)];
    for (let iy = 0; iy < ng; iy++) {
      for (let ix = 0; ix < ng; ix++) {
        p[iy * ng + ix] = (at(z, ix + 1, iy) - at(z, ix - 1, iy)) / (2 * c.bin);
        q[iy * ng + ix] = (at(z, ix, iy + 1) - at(z, ix, iy - 1)) / (2 * c.bin);
      }
    }
    // energy and its lateral gradients, which nonparallelism needs
    const e = new Float32Array(N), gx = new Float32Array(N), gy = new Float32Array(N);
    for (let i = 0; i < N; i++) e[i] = a[i] * a[i];
    for (let iy = 0; iy < ng; iy++) {
      for (let ix = 0; ix < ng; ix++) {
        gx[iy * ng + ix] = (at(e, ix + 1, iy) - at(e, ix - 1, iy)) / (2 * c.bin);
        gy[iy * ng + ix] = (at(e, ix, iy + 1) - at(e, ix, iy - 1)) / (2 * c.bin);
      }
    }
    return { ng: ng, bin: c.bin, z: z, a: a, e: e, p: p, q: q, gx: gx, gy: gy, facies: facies };
  }

  /* =======================================================================
     GATHERING ALONG DIP, IN A SECTION

     Read J traces at a time offset of p samples per trace from the analysis
     point, interpolating because that offset is almost never a whole sample.
     ATTR has this for its own use; this version returns the traces separately
     rather than flattened, because the filters need to know which value came
     from which trace.
     ======================================================================= */

  function gatherTraces(f, nx, nt, ix, it, p, half, kHalf) {
    const out = [];
    for (let j = -half; j <= half; j++) {
      const x = clamp(ix + j, 0, nx - 1);
      const tr = new Float32Array(2 * kHalf + 1);
      for (let k = -kHalf; k <= kHalf; k++) {
        const tt = it + k + p * j;
        const i0 = Math.floor(tt), fr = tt - i0;
        const v0 = f[x * nt + clamp(i0, 0, nt - 1)];
        const v1 = f[x * nt + clamp(i0 + 1, 0, nt - 1)];
        tr[k + kHalf] = v0 * (1 - fr) + v1 * fr;
      }
      out.push(tr);
    }
    return out;
  }

  /* The single dipping plane through the analysis point: one value per trace.
     The mean, alpha-trimmed and LUM filters use only this. */
  function gatherPlane(f, nx, nt, ix, it, p, half) {
    const out = new Float64Array(2 * half + 1);
    for (let j = -half; j <= half; j++) {
      const x = clamp(ix + j, 0, nx - 1);
      const tt = it + p * j;
      const i0 = Math.floor(tt), fr = tt - i0;
      const v0 = f[x * nt + clamp(i0, 0, nt - 1)];
      const v1 = f[x * nt + clamp(i0 + 1, 0, nt - 1)];
      out[j + half] = v0 * (1 - fr) + v1 * fr;
    }
    return out;
  }

  /* =======================================================================
     CANVAS SIZING

     Size to the parent's CONTENT box. clientWidth includes padding, and a tab
     pane has 26 px of it, so a full-width panel drawn to clientWidth overruns
     its container by 52 px.
     ======================================================================= */

  function panelWidth(el, min) {
    const par = el && el.parentElement;
    if (!par) return 900;
    const cs = window.getComputedStyle(par);
    return Math.max(min || 240, Math.floor(par.clientWidth
      - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)));
  }

  function rowWidth(rowId, n) {
    const row = $(rowId);
    const total = row ? panelWidth(row.firstElementChild || row) : 800;
    const w = window.innerWidth <= 700
      ? Math.max(240, total)
      : Math.max(150, Math.floor((total - 10 * (n - 1)) / n));
    if (row) {
      row.querySelectorAll(':scope > .panel-col').forEach((el) => {
        el.style.width = w + 'px'; el.style.maxWidth = w + 'px';
      });
    }
    return w;
  }

  /* =======================================================================
     DRAWING
     ======================================================================= */

  /** Paint an nx-by-ny grid into a rectangle. get(ix,iy) returns 0..1. */
  function imageInto(ctx, R, nx, ny, get, map) {
    const off = document.createElement('canvas');
    off.width = nx; off.height = ny;
    const octx = off.getContext('2d');
    const img = octx.createImageData(nx, ny);
    for (let r = 0; r < ny; r++) {
      const iy = ny - 1 - r;
      for (let cx = 0; cx < nx; cx++) {
        const col = map(get(cx, iy));
        const k = (r * nx + cx) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1];
        img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, R.x, R.y, R.w, R.h);
    ctx.restore();
  }

  /** A color bar under a plot. Every attribute map in this set gets one. */
  function colorbar(ctx, R, map, loLabel, hiLabel, midLabel, dy) {
    const B = { x: R.x, y: R.y + R.h + (dy === undefined ? 40 : dy), w: R.w, h: 9 };
    const n = Math.max(2, Math.round(B.w));
    for (let i = 0; i < n; i++) {
      const col = map(i / (n - 1));
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      ctx.fillRect(B.x + i * (B.w / n), B.y, B.w / n + 1, B.h);
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(22,25,28,.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(B.x + 0.5, B.y + 0.5, B.w, B.h);
    ctx.font = '9.5px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#5C6670'; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText(loLabel, B.x, B.y + B.h + 3);
    ctx.textAlign = 'right'; ctx.fillText(hiLabel, B.x + B.w, B.y + B.h + 3);
    if (midLabel) { ctx.textAlign = 'center'; ctx.fillText(midLabel, B.x + B.w / 2, B.y + B.h + 3); }
    ctx.restore();
  }

  /**
   * A square map panel. A grid with equal bin spacing in both directions has
   * to be drawn into a SQUARE plot box; drawn into whatever rectangle happens
   * to be available, a dome becomes an ellipse and every azimuth read off the
   * map is wrong.
   */
  function squareMap(canvasId, w, h, ng, bin, get, map, opts) {
    const o = opts || {};
    const M = o.margin || { l: 52, r: 14, t: 10, b: 34 };
    const ctx = SEIS.fitCanvas($(canvasId), w, h);
    ctx.clearRect(0, 0, w, h);
    const availW = w - M.l - M.r, availH = h - M.t - M.b - (o.bar ? 52 : 0);
    const side = Math.max(40, Math.min(availW, availH));
    const R = { x: M.l + (availW - side) / 2, y: M.t, w: side, h: side };
    imageInto(ctx, R, ng, ng, get, map);
    if (o.overlay) o.overlay(ctx, R);
    SEIS.frame(ctx, R);
    const km = (ng - 1) * bin / 1000;
    SEIS.axisBottom(ctx, R, 0, km, o.xlabel || 'east (km)', (v) => v.toFixed(1), { ticks: 4 });
    SEIS.axisLeft(ctx, R, 0, km, o.ylabel || 'north (km)', (v) => v.toFixed(1),
      { flip: true, ticks: 4 });
    if (o.bar) o.bar(ctx, R);
    return { ctx: ctx, R: R };
  }

  /** Convert a grid index to canvas coordinates inside a square map. */
  function gridToXY(R, ng, ix, iy) {
    return {
      x: R.x + ((ix + 0.5) / ng) * R.w,
      y: R.y + R.h - ((iy + 0.5) / ng) * R.h,
    };
  }

  /** Draw a marker at the analysis point. */
  function marker(ctx, x, y, color, r) {
    ctx.save();
    ctx.strokeStyle = color || '#16191C'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r || 5.5, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  /** Outline the analysis window on a section, drawn along its dip. */
  function windowOutline(ctx, R, nx, nt, ix, it, p, half, kHalf, color) {
    const X = (x) => R.x + (x / (nx - 1)) * R.w;
    const Y = (t) => R.y + (t / (nt - 1)) * R.h;
    ctx.save();
    ctx.strokeStyle = color || '#841617'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(X(ix - half), Y(it - p * half - kHalf));
    ctx.lineTo(X(ix + half), Y(it + p * half - kHalf));
    ctx.lineTo(X(ix + half), Y(it + p * half + kHalf));
    ctx.lineTo(X(ix - half), Y(it - p * half + kHalf));
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  /* =======================================================================
     TABS AND STEP NAVIGATION

     A long module is hard to work through by scrolling, because the controls
     end up off screen by the time you reach the discussion. The tab strip
     keeps the live panel pinned and changes only the explanation underneath.
     ======================================================================= */

  function setupTabs(opts) {
    const panes = opts.panes;                 // ordered list of pane ids
    const names = opts.names;                 // id -> short label
    const steps = opts.steps || panes.filter((p) => /^p\d+$/.test(p));
    const hideLab = opts.hideLabOn || [];
    const onShow = opts.onShow || function () { };

    // forward and back inside the module, so the way on is never the way out
    panes.forEach((id, i) => {
      const pane = $(id);
      if (!pane || pane.querySelector('.stepnav')) return;
      const prev = panes[i - 1], next = panes[i + 1];
      const nav = document.createElement('div');
      nav.className = 'stepnav';
      const mk = (target, label, ghost) => {
        const a = document.createElement('a');
        a.className = 'btn' + (ghost ? ' ghost' : '');
        a.href = '#tabs'; a.textContent = label;
        a.addEventListener('click', (ev) => {
          ev.preventDefault(); show(target);
          const s = $('tabs'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'start' });
        });
        return a;
      };
      nav.appendChild(prev ? mk(prev, '\u2190 ' + names[prev], true)
                           : document.createElement('span'));
      const where = document.createElement('span');
      where.className = 'where';
      const si = steps.indexOf(id);
      where.textContent = si >= 0 ? 'step ' + (si + 1) + ' of ' + steps.length : names[id];
      nav.appendChild(where);
      nav.appendChild(next ? mk(next, names[next] + ' \u2192')
                           : document.createElement('span'));
      pane.appendChild(nav);
    });

    function show(id) {
      panes.forEach((q) => { const el = $(q); if (el) el.hidden = q !== id; });
      document.querySelectorAll('#tabs button').forEach((b) => {
        b.setAttribute('aria-selected', b.dataset.tab === id);
      });
      const lab = document.querySelector('.labhead');
      if (lab) lab.hidden = hideLab.indexOf(id) >= 0;
      const last = id === panes[panes.length - 1] || id === panes[panes.length - 2];
      if ($('nextup')) $('nextup').hidden = !last;
      if ($('pager')) $('pager').hidden = !last;
      onShow(id);
    }

    document.querySelectorAll('#tabs button').forEach((b) => {
      b.addEventListener('click', () => show(b.dataset.tab));
    });
    // the masthead links open a reference tab rather than jumping to an anchor
    // inside a pane that is hidden until its tab is chosen
    document.querySelectorAll('.masthead a[data-tab]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault(); show(a.dataset.tab);
        const s = $('tabs'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'start' });
      });
    });
    return show;
  }

  /** Wire every slider that carries data-key straight into a state object. */
  function bindControls(S, after) {
    /* Both events, and not one of them.

       Range inputs and checkboxes fire 'input' as they move, which is what
       gives a slider its live response. A <select> is the problem: the spec
       has it firing 'input' as well as 'change', but Safari and older WebKit
       fire only 'change'. Listening for 'input' alone leaves every method
       chooser in this set dead in those browsers, and the failure is silent —
       the menu changes, the panels do not. Listening for both costs a
       duplicated call on the browsers that send both, which is harmless
       because the handler is idempotent and the redraw behind it is
       debounced. */
    const onChange = (ev) => {
      const key = ev.target && ev.target.dataset && ev.target.dataset.key;
      if (!key) return;
      S[key] = ev.target.type === 'checkbox' ? (ev.target.checked ? 1 : 0)
                                             : parseFloat(ev.target.value);
      after();
    };
    document.addEventListener('input', onChange);
    document.addEventListener('change', onChange);
    // put the saved state back into the widgets on load
    Object.keys(S).forEach((k) => {
      const el = document.querySelector('[data-key="' + k + '"]');
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!S[k];
      else el.value = S[k];
    });
  }

  /** Drag anywhere on a canvas to move the analysis point. */
  /* =======================================================================
     PHYSICAL UNITS

     Every attribute in this set is defined by a window, and the size a window
     should be is a physical question rather than a question about arrays. Six
     traces means nothing on its own; six traces at a 12.5 m bin is 75 m of
     ground, and whether that is the right answer depends on how big the
     feature being looked for is. The models are built in samples and traces
     because that is what the arithmetic needs, so the conversion has to be
     carried somewhere, and carrying it here keeps every module quoting the
     same numbers.

     Two constants do the work. The interval velocity converts two-way time to
     thickness, halving it on the way because seismic time is two-way. The bin
     spacing converts traces to distance along the line.
     ======================================================================= */

  function physics(cfg) {
    const c = Object.assign({ dt: 0.002, v: 2800, bin: 12.5, freq: 30 }, cfg || {});
    const U = () => SEIS.UNITS[c.units || 'm'];
    const P = {
      dt: c.dt, v: c.v, bin: c.bin, freq: c.freq,
      // a count of samples, as two-way time in ms
      ms: (n) => n * c.dt * 1000,
      // the same count as a thickness of rock
      thick: (n) => n * c.dt * c.v / 2,
      // a count of traces, as distance along the line
      across: (n) => n * c.bin,
      // dominant wavelength, and the two resolution numbers that follow it
      lambda: () => c.v / c.freq,
      quarter: () => c.v / c.freq / 4,
      eighth: () => c.v / c.freq / 8,
      // a quarter wavelength expressed back in samples, which is the number a
      // throw slider has to be read against
      quarterSamples: () => (1 / c.freq) / 4 / c.dt,
      setUnits: (u) => { c.units = u; },
      // trace spacing is a survey parameter, so a module that lets a reader
      // change it has to be able to change it here too
      setBin: (b) => { c.bin = b; P.bin = b; },
      /* The dip a reader measures off a panel, given the dip in the ground.
         A section is drawn with the time axis stretched relative to the
         distance axis, and the ratio of the two scales is the vertical
         exaggeration. Dips read off a section are steeper than the dips in
         the rock by exactly that factor, which is a thing worth showing
         rather than correcting away. */
      drawnDip: (deg, R, nx, nt) => {
        const pxPerM_h = R.w / (nx * c.bin);
        const pxPerM_v = R.h / (nt * c.dt * c.v / 2);
        const t = Math.tan(deg * Math.PI / 180) * (pxPerM_v / pxPerM_h);
        return Math.atan(t) * 180 / Math.PI;
      },
      exaggeration: (R, nx, nt) =>
        (R.h / (nt * c.dt * c.v / 2)) / (R.w / (nx * c.bin)),
      unitLabel: () => U().lab,
      // format a length, converting to the display unit
      len: (m, d) => (m * U().len).toFixed(d === undefined ? 0 : d) + ' ' + U().lab,
      vel: () => Math.round(c.v * U().vel) + ' ' + U().vlab,
    };
    return P;
  }

  /* =======================================================================
     THE UTILITY BAR

     Four things every module should offer and none of them did: a link that
     reproduces the exact setup on screen, the section as a PNG, a way back to
     the defaults, and a way to redraw the geology without changing any
     setting. The last one matters most. A student who measures a separation
     between two attributes on one model has measured it on one model; the
     reroll is what turns that into a claim about the attributes rather than
     about seed 21.
     ======================================================================= */

  function utilityBar(opts) {
    const o = opts || {};
    const host = $(o.into || 'utilbar');
    if (!host) return;
    const mk = (id, label, ghost) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small' + (ghost === false ? '' : ' ghost');
      b.id = id; b.textContent = label;
      host.appendChild(b);
      return b;
    };
    if (o.onReroll) {
      mk('rerollBtn', o.rerollLabel || 'New stratigraphy', false)
        .addEventListener('click', o.onReroll);
    }
    if (location.protocol !== 'file:') {
      mk('copyBtn', 'Copy link to this setup')
        .addEventListener('click', function () { SEIS.copyLink(this); });
    }
    if (o.canvas) {
      mk('pngBtn', 'Save the section as PNG')
        .addEventListener('click', () => SEIS.savePNG($(o.canvas), o.pngName || 'section'));
    }
    if (o.onReset) {
      mk('resetBtn', 'Reset').addEventListener('click', o.onReset);
    }
    if (o.onColorVision) {
      const cv = document.createElement('div');
      cv.className = 'ctl';
      cv.innerHTML = '<label for="cvdSel">Color scales</label>'
        + '<select id="cvdSel"><option value="standard">Standard</option>'
        + '<option value="cvd">Color-vision safe</option></select>';
      host.appendChild(cv);
      const sel = cv.querySelector('select');
      sel.value = o.colorVision || 'standard';
      sel.addEventListener('change', () => o.onColorVision(sel.value));
    }
    if (o.onUnits) {
      const wrap = document.createElement('div');
      wrap.className = 'ctl';
      wrap.innerHTML = '<label for="unitsSel">Units</label>'
        + '<select id="unitsSel"><option value="m">Meters</option>'
        + '<option value="ft">Feet</option></select>';
      host.appendChild(wrap);
      const sel = wrap.querySelector('select');
      sel.value = o.units || 'm';
      sel.addEventListener('change', () => o.onUnits(sel.value));
    }
  }

  /** Reset a state object to its defaults, clear the URL, and redraw. */
  function resetState(S, DEF, after) {
    Object.keys(DEF).forEach((k) => { S[k] = DEF[k]; });
    try {
      history.replaceState(null, '', location.pathname);
    } catch (e) { /* file:// */ }
    Object.keys(S).forEach((k) => {
      const el = document.querySelector('[data-key="' + k + '"]');
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!S[k];
      else el.value = S[k];
    });
    after();
  }

  /* =======================================================================
     ONLY REBUILD WHAT CHANGED

     Every module used to rebuild its whole model on every control event. In
     the disorder module that is 217 ms to build the section, 1205 ms for the
     dip field, 197 ms for coherence and 79 ms for the raw operator: about 1.7
     seconds on a desktop, and several times that on a phone. Most controls do
     not touch most of that. Dragging the analysis point changes nothing about
     the model at all, and the smoothing length changes only the last stage.

     stage() runs a piece of work only when the values it depends on have
     changed since the last time. The dependency list is given at the call
     site, next to the work, so it stays honest as the code moves. Listing one
     value too many costs a recompute that was not needed; listing one too few
     leaves a stale field on screen, so when in doubt, list it.
     ======================================================================= */

  function stager() {
    const seen = {};
    return function stage(name, deps, work) {
      const sig = JSON.stringify(deps);
      if (seen[name] === sig) return false;
      seen[name] = sig;
      work();
      return true;
    };
  }

  function attachProbe(canvasId, toGrid) {
    const c = $(canvasId);
    if (!c) return;
    let down = false;
    const go = (ev) => {
      const r = c.getBoundingClientRect();
      toGrid(ev.clientX - r.left, ev.clientY - r.top, r);
    };
    c.addEventListener('pointerdown', (e) => {
      down = true; if (c.setPointerCapture) c.setPointerCapture(e.pointerId);
      e.preventDefault(); go(e);
    });
    c.addEventListener('pointermove', (e) => { if (down) go(e); });
    c.addEventListener('pointerup', () => { down = false; });
    c.addEventListener('pointercancel', () => { down = false; });
  }

  /** Write a value into a .stat or .val element without checking it exists. */
  function put(id, text) { const el = $(id); if (el) el.textContent = text; }

  /* --------------------------------------------------------------------- */

  return {
    guard, buildSection, buildHorizon, buildSlice,
    gatherTraces, gatherPlane,
    panelWidth, rowWidth, imageInto, colorbar, squareMap, gridToXY, marker,
    windowOutline, setupTabs, bindControls, attachProbe, put, clamp,
    physics, utilityBar, resetState, stager,
  };
})();
