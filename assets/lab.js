/* ===========================================================================
   lab.js — the parts every module in this set needs
   "More Geometric Attributes, and How They Actually Work"
   Heather Bedle / AASPI / University of Oklahoma

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
    const missing = needed.filter((n) => typeof window[n] === 'undefined');
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
       fold            relief of the fold, in samples
       foldWidth       how wide the fold is, as a fraction of the section. A
                       narrow fold gives steep flanks without translating the
                       whole section off the bottom of the display, which is
                       what a regional tilt does once it is steep enough to be
                       worth looking at
       throw           fault throw, in samples; 0 removes the fault
       faultAt         trace index of the fault
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
      fold: 16, foldWidth: 0.24, throw: 0, faultAt: 0.52,
      chaos: 0, chaosTop: 0.34, chaosBot: 0.56,
      noise: 0, spike: 0, coherent: 0, seed: 7,
      channel: 0, channelAt: 0.30,
    }, cfg || {});

    const nx = c.nx, nt = c.nt;
    const rnd = SEIS.mulberry32(c.seed);
    const wav = SEIS.makeWavelet({ type: 'ricker', f: c.freq });
    const fx = Math.round(c.faultAt * nx);

    // --- the horizons ----------------------------------------------------
    // Nine reflectors. The upper and lower packages are conformable; the
    // middle package is the one the chaos slider attacks.
    const HZ = [];
    // spaced as fractions of the section, so a module can choose any nt and
    // still get nine reflectors inside the display rather than below it
    const base = [0.10, 0.20, 0.29, 0.37, 0.45, 0.55, 0.65, 0.76, 0.87]
      .map((u) => Math.round(u * nt));
    for (let h = 0; h < base.length; h++) {
      const t = new Float32Array(nx);
      const inChaosPkg = base[h] >= c.chaosTop * nt && base[h] <= c.chaosBot * nt;
      for (let ix = 0; ix < nx; ix++) {
        const u = ix / (nx - 1);
        // a broad fold plus a gentle regional dip, both decreasing with depth
        // so the section shows growth rather than a stack of parallel copies
        const grow = 0.5 + 0.5 * (h / (base.length - 1));
        let z = base[h]
          - c.fold * grow * Math.exp(-Math.pow((u - 0.42) / c.foldWidth, 2))
          + 10 * grow * (u - 0.5);
        if (c.throw && ix >= fx) z += c.throw;                 // the fault
        if (inChaosPkg && c.chaos > 0) {
          // reflectors in a chaotic package wander: three wavelengths of
          // wobble, scaled by the slider
          z += c.chaos * (7 * Math.sin(u * 17 + h * 1.9)
                        + 5 * Math.sin(u * 41 + h * 0.7)
                        + 4 * (rnd() * 2 - 1));
        }
        t[ix] = z;
      }
      HZ.push({ t: t, rc: (h % 2 ? -1 : 1) * (0.55 + 0.45 * ((h * 7) % 5) / 4),
                chaotic: inChaosPkg });
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
        if (c.channel > 0 && h === 4) {
          const d = Math.abs(ix - chX);
          const inside = 1 / (1 + Math.exp((d - 13) / 2.2));
          r *= 1 - c.channel * inside;
        }
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
    return { f: f, nx: nx, nt: nt, dt: c.dt, peak: pk, horizons: HZ, faultX: fx, wav: wav };
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

        // a normal fault running north-south with a little sinuosity
        const fx = ng * 0.30 + 4 * Math.sin(iy * 0.13);
        if (c.throwM && ix > fx) d += c.throwM;
        if (c.throwM && Math.abs(ix - fx) < 1.2) facies[i] = 3;

        // a chaotic package: salt, or a mass transport complex
        if (c.saltR > 0) {
          const r = Math.hypot(ix - cx, iy - cy) / (c.saltR * ng);
          if (r < 1) {
            facies[i] = 1;
            const taper = 1 - r * r;
            d += c.chaos * taper * (11 * Math.sin(ix * 0.9 + iy * 0.6)
                                  + 8 * Math.sin(ix * 0.35 - iy * 1.4)
                                  + 9 * (rnd() * 2 - 1));
            // Amplitudes inside are poor and fairly uniform, and climb steeply
            // back to normal at the rim - which is how salt and a mass
            // transport complex behave, and why an attribute built on the
            // amplitude gradient finds the boundary rather than the interior.
            amp *= 0.30 + 0.70 * Math.pow(r, 6);
          }
        }

        // a channel: dim fill, no structural expression at all
        if (c.channel > 0) {
          const chx = ng * 0.74 + 7 * Math.sin(iy * 0.09);
          const dd = Math.abs(ix - chx);
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
    document.addEventListener('input', (ev) => {
      const key = ev.target && ev.target.dataset && ev.target.dataset.key;
      if (!key) return;
      S[key] = ev.target.type === 'checkbox' ? (ev.target.checked ? 1 : 0)
                                             : parseFloat(ev.target.value);
      after();
    });
    // put the saved state back into the widgets on load
    Object.keys(S).forEach((k) => {
      const el = document.querySelector('[data-key="' + k + '"]');
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!S[k];
      else el.value = S[k];
    });
  }

  /** Drag anywhere on a canvas to move the analysis point. */
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
    guard, buildSection, buildHorizon,
    gatherTraces, gatherPlane,
    panelWidth, rowWidth, imageInto, colorbar, squareMap, gridToXY, marker,
    windowOutline, setupTabs, bindControls, attachProbe, put, clamp,
  };
})();
