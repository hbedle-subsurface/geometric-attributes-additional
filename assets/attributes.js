/* ===========================================================================
   attributes.js — geometric attribute computation
   "How Geometric Attributes Actually Work"
   Heather Bedle and April Moreno-Ward / AASPI / University of Oklahoma

   Companion to seismic.js, which supplies wavelets, convolution, color maps,
   the FFT and the canvas helpers. This file holds the attribute algorithms
   themselves, written the way the textbooks describe them rather than in any
   optimised form, so the code can be read alongside the module that uses it.

   Everything here is 2D (one inline). Crossline dip, dip azimuth and the true
   3D forms arrive with the later modules; where a 2D form is a simplification
   of a 3D one, the comment says so.
   =========================================================================== */

const ATTR = (function () {
  'use strict';

  /* ---------------------------------------------------------------------
     SEMBLANCE

     The quantity nearly every geometric attribute is built on. For J traces
     over a window of K samples,

         semblance = mean over k of ( sum_j a_jk )^2
                     -------------------------------------
                     J * mean over k of sum_j a_jk^2

     It is 1 when every trace in the window is identical and falls toward 1/J
     when they are unrelated. Marfurt et al. (1998) introduced it as a coherence
     measure; here it is also the thing a dip scan maximizes.
     --------------------------------------------------------------------- */

  function semblance(gather, J, K) {
    let num = 0, den = 0;
    for (let k = 0; k < K; k++) {
      let s = 0, ss = 0;
      for (let j = 0; j < J; j++) {
        const v = gather[j * K + k];
        s += v; ss += v * v;
      }
      num += s * s;
      den += ss;
    }
    if (den < 1e-20) return 0;
    return num / (J * den);
  }

  /* ---------------------------------------------------------------------
     SAMPLING ALONG A DIP

     A candidate dip p is a time shift per trace. Gathering along it means
     reading each neighboring trace at a time offset of p times its distance
     from the centre, with linear interpolation because that offset is almost
     never a whole sample.
     --------------------------------------------------------------------- */

  function gatherAlongDip(field, nx, nt, ix, it, p, half, kHalf, out) {
    const J = 2 * half + 1, K = 2 * kHalf + 1;
    for (let j = -half; j <= half; j++) {
      const jx = Math.min(nx - 1, Math.max(0, ix + j));
      const shift = p * j;                       // samples, may be fractional
      for (let k = -kHalf; k <= kHalf; k++) {
        const pos = it + k + shift;
        const i0 = Math.floor(pos), f = pos - i0;
        let v = 0;
        if (i0 >= 0 && i0 < nt - 1) {
          v = field[jx * nt + i0] * (1 - f) + field[jx * nt + i0 + 1] * f;
        } else if (i0 >= 0 && i0 < nt) {
          v = field[jx * nt + i0];
        }
        out[(j + half) * K + (k + kHalf)] = v;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------------
     DIP SCAN

     The estimator: try a fan of candidate dips, gather along each, and keep
     the one whose semblance is highest. This is the discrete dip search of
     Marfurt et al. (1998). It is deliberately brute force — the point of the
     module is to let a student watch the search happen and see the winning
     dip fall out of a curve, rather than appear from a closed form.

     Returns { p, sem, curve } with p in samples per trace, and curve holding
     the semblance at every candidate so the search can be plotted.
     --------------------------------------------------------------------- */

  function dipScan(field, nx, nt, ix, it, opts) {
    const o = opts || {};
    const half = o.half === undefined ? 2 : o.half;       // traces either side
    const kHalf = o.kHalf === undefined ? 5 : o.kHalf;    // samples either side
    const pMax = o.pMax === undefined ? 4 : o.pMax;       // samples per trace
    const nP = o.nP === undefined ? 41 : o.nP;

    const J = 2 * half + 1, K = 2 * kHalf + 1;
    const buf = new Float64Array(J * K);
    const curve = new Float64Array(nP);
    let best = -1, bestP = 0, bestI = 0;

    for (let i = 0; i < nP; i++) {
      const p = -pMax + (2 * pMax * i) / (nP - 1);
      gatherAlongDip(field, nx, nt, ix, it, p, half, kHalf, buf);
      const s = semblance(buf, J, K);
      curve[i] = s;
      if (s > best) { best = s; bestP = p; bestI = i; }
    }

    // Parabolic refinement on the winning sample, so the estimate is not
    // quantized to the candidate spacing. Real implementations do the same.
    let p = bestP;
    if (bestI > 0 && bestI < nP - 1) {
      const a = curve[bestI - 1], b = curve[bestI], c = curve[bestI + 1];
      const den = a - 2 * b + c;
      if (Math.abs(den) > 1e-12) {
        const step = (2 * pMax) / (nP - 1);
        p = bestP - 0.5 * step * (c - a) / den;
      }
    }
    return { p, sem: best, curve, pMax, nP };
  }

  /**
   * Dip everywhere, on a decimated grid.
   *
   * Production code estimates dip at every sample; this decimates and
   * interpolates for display, because a full-density scan of a few hundred by
   * a few hundred with forty candidate dips is tens of millions of operations
   * and would make the sliders stutter. The decimation is a display choice,
   * not part of the method, and the module says so.
   */
  function dipField(field, nx, nt, opts) {
    const o = opts || {};
    const dx = o.decX || 2, dt = o.decT || 3;
    const gx = Math.ceil(nx / dx), gt = Math.ceil(nt / dt);
    const p = new Float32Array(gx * gt);
    const sem = new Float32Array(gx * gt);
    for (let a = 0; a < gx; a++) {
      const ix = Math.min(nx - 1, a * dx);
      for (let b = 0; b < gt; b++) {
        const it = Math.min(nt - 1, b * dt);
        const r = dipScan(field, nx, nt, ix, it, o);
        p[a * gt + b] = r.p;
        sem[a * gt + b] = r.sem;
      }
    }
    return { p, sem, gx, gt, decX: dx, decT: dt };
  }

  // bilinear read from a decimated grid, in full-resolution coordinates
  function sampleGrid(g, arr, ix, it) {
    const a = Math.min(g.gx - 1.001, Math.max(0, ix / g.decX));
    const b = Math.min(g.gt - 1.001, Math.max(0, it / g.decT));
    const a0 = Math.floor(a), b0 = Math.floor(b);
    const fa = a - a0, fb = b - b0;
    const v00 = arr[a0 * g.gt + b0], v10 = arr[(a0 + 1) * g.gt + b0];
    const v01 = arr[a0 * g.gt + b0 + 1], v11 = arr[(a0 + 1) * g.gt + b0 + 1];
    return (v00 * (1 - fa) + v10 * fa) * (1 - fb) + (v01 * (1 - fa) + v11 * fa) * fb;
  }

  /* ---------------------------------------------------------------------
     UNIT CONVERSIONS

     Dip is computed in samples per trace, which is the natural unit for the
     algorithm and a meaningless one for an interpreter. These convert it into
     the two forms people actually quote.
     --------------------------------------------------------------------- */

  // samples/trace -> milliseconds per trace
  const dipToMsPerTrace = (p, dtSec) => p * dtSec * 1000;

  // samples/trace -> geological dip in degrees, given trace spacing and velocity.
  // Time dip dt/dx relates to true dip theta by dt/dx = 2 sin(theta) / V.
  function dipToDegrees(p, dtSec, dxM, vMs) {
    const timeDip = (p * dtSec) / dxM;          // s per m, two-way
    const s = (timeDip * vMs) / 2;
    return Math.abs(s) >= 1 ? 90 * Math.sign(s) : Math.asin(s) * 180 / Math.PI;
  }

  // degrees -> samples/trace. The inverse of the above, and the conversion that
  // turns a dip search range quoted in degrees, which is how every GUI asks for
  // it, into the sample shifts the search actually applies. Note that it depends
  // on the velocity: the same search range in degrees is a different search in
  // samples if you change the conversion velocity.
  function degToDip(deg, dtSec, dxM, vMs) {
    const s = Math.sin(deg * Math.PI / 180);
    return (2 * s * dxM) / (vMs * dtSec);
  }

  /* ---------------------------------------------------------------------
     THE SAME SCAN, IN THREE DIMENSIONS

     A 3D volume is stored trace-major: vol[(iy * nil + ix) * nt + it]. A
     candidate orientation is now a pair, px samples per inline trace and py
     samples per crossline trace, and the window is a square patch of traces
     rather than a line of them. Everything else is unchanged from the 2D
     case, which is the point worth making to a student.
     --------------------------------------------------------------------- */

  function gatherAlongDip3D(vol, nil, nxl, nt, ix, iy, it, px, py, half, kHalf, out) {
    const K = 2 * kHalf + 1;
    let n = 0;
    for (let jy = -half; jy <= half; jy++) {
      const yy = Math.min(nxl - 1, Math.max(0, iy + jy));
      for (let jx = -half; jx <= half; jx++) {
        const xx = Math.min(nil - 1, Math.max(0, ix + jx));
        const shift = px * jx + py * jy;         // samples, usually fractional
        const base = (yy * nil + xx) * nt;
        for (let k = -kHalf; k <= kHalf; k++) {
          const pos = it + k + shift;
          const i0 = Math.floor(pos), f = pos - i0;
          let v = 0;
          if (i0 >= 0 && i0 < nt - 1) v = vol[base + i0] * (1 - f) + vol[base + i0 + 1] * f;
          else if (i0 >= 0 && i0 < nt) v = vol[base + i0];
          out[n * K + (k + kHalf)] = v;
        }
        n++;
      }
    }
    return out;
  }

  /**
   * Scan a square grid of candidate orientations and keep the best.
   *
   * Returns { px, py, sem, grid, nP, pMax } with grid[a * nP + b] holding the
   * semblance at inline candidate a and crossline candidate b, so the whole
   * search surface can be drawn rather than just its winner.
   *
   * The refinement fits a parabola along each axis through the winning cell.
   * A true 2D peak wants a paraboloid with a cross term; the separable form
   * used here is what most implementations do and is accurate while the peak
   * is not strongly skewed.
   */
  function dipScan3D(vol, nil, nxl, nt, ix, iy, it, opts) {
    const o = opts || {};
    const half = o.half === undefined ? 2 : o.half;
    const kHalf = o.kHalf === undefined ? 8 : o.kHalf;
    const pMax = o.pMax === undefined ? 4 : o.pMax;
    const nP = o.nP === undefined ? 17 : o.nP;

    const JT = (2 * half + 1) * (2 * half + 1), K = 2 * kHalf + 1;
    const buf = new Float64Array(JT * K);
    const grid = new Float32Array(nP * nP);
    const cand = (i) => -pMax + (2 * pMax * i) / (nP - 1);
    let best = -1, ba = 0, bb = 0;

    for (let a = 0; a < nP; a++) {
      for (let b = 0; b < nP; b++) {
        gatherAlongDip3D(vol, nil, nxl, nt, ix, iy, it, cand(a), cand(b), half, kHalf, buf);
        const s = semblance(buf, JT, K);
        grid[a * nP + b] = s;
        if (s > best) { best = s; ba = a; bb = b; }
      }
    }

    const step = (2 * pMax) / (nP - 1);
    const refine = (lo, mid, hi, at) => {
      const den = lo - 2 * mid + hi;
      if (Math.abs(den) < 1e-12) return at;
      return at - 0.5 * step * (hi - lo) / den;
    };
    let px = cand(ba), py = cand(bb);
    if (ba > 0 && ba < nP - 1) {
      px = refine(grid[(ba - 1) * nP + bb], grid[ba * nP + bb], grid[(ba + 1) * nP + bb], px);
    }
    if (bb > 0 && bb < nP - 1) {
      py = refine(grid[ba * nP + bb - 1], grid[ba * nP + bb], grid[ba * nP + bb + 1], py);
    }
    return { px, py, sem: best, grid, nP, pMax, ia: ba, ib: bb };
  }

  /* ---------------------------------------------------------------------
     FROM TWO COMPONENTS TO AN ORIENTATION

     Inline and crossline dip are quoted per trace and per line. Before they
     can be combined they have to be put on a common footing, which means
     dividing by the bin spacing in each direction. Skipping that step is
     invisible whenever the bins are square, and wrong whenever they are not.
     --------------------------------------------------------------------- */

  // ms per trace -> ms per meter, given the bin spacing in that direction
  const perTraceToPerMetre = (msPerTrace, binM) => msPerTrace / binM;

  // Magnitude and azimuth of the time-dip gradient. Azimuth is degrees
  // counter-clockwise from the inline axis, pointing downdip: it is atan2 of
  // the crossline component over the inline one, so with inline drawn to the
  // right and crossline upward it increases the way a protractor does. Survey
  // rotation and any conversion to a geographic azimuth happen elsewhere.
  function dipMagAzim(gx, gy) {
    const mag = Math.sqrt(gx * gx + gy * gy);
    let az = Math.atan2(gy, gx) * 180 / Math.PI;
    if (az < 0) az += 360;
    return { mag, az };
  }

  // apparent time dip in a vertical section cut at a given azimuth, per meter
  const apparentDip = (gx, gy, azDeg) => {
    const a = azDeg * Math.PI / 180;
    return gx * Math.cos(a) + gy * Math.sin(a);
  };

  // gradient magnitude in ms/m -> geological dip in degrees, two-way time
  function gradientToDegrees(magMsPerM, vMs) {
    const s = (vMs * (magMsPerM / 1000)) / 2;
    return Math.abs(s) >= 1 ? 90 : Math.asin(s) * 180 / Math.PI;
  }

  /* =====================================================================
     THE COHERENCE FAMILY

     Every attribute below except the Sobel filter is computed from one
     covariance matrix built from the analytic trace, following AASPI program
     similarity3d (Geometric Attributes: Program similarity3d, 13 June 2022).
     Equation numbers in the comments refer to that document.
     ===================================================================== */

  /**
   * Covariance matrix of an analysis window, equations 1a and 1b.
   *
   * d and dH are J traces by K samples, trace-major, already gathered along
   * dip. C is J-by-J: C[m][n] sums the product of trace m and trace n over the
   * window, using the amplitude and its Hilbert transform. The quadrature
   * terms do not change the vertical resolution but stabilize the estimate
   * near amplitude zero crossings.
   *
   * w is an optional per-sample taper (equation 1b); omit for no taper.
   */
  function covarianceAnalytic(d, dH, J, K, w) {
    const C = new Float64Array(J * J);
    for (let m = 0; m < J; m++) {
      for (let n = m; n < J; n++) {
        let sum = 0;
        for (let k = 0; k < K; k++) {
          const wk = w ? w[k] : 1;
          sum += wk * (d[m * K + k] * d[n * K + k] + dH[m * K + k] * dH[n * K + k]);
        }
        C[m * J + n] = sum; C[n * J + m] = sum;
      }
    }
    return C;
  }

  // total energy of the window, equation 7. Equals the trace of C.
  function totalEnergy(C, J) {
    let e = 0;
    for (let m = 0; m < J; m++) e += C[m * J + m];
    return e;
  }

  /**
   * Eigenvalues and eigenvectors of a small real symmetric matrix, by cyclic
   * Jacobi rotation. Returns values sorted largest first (equation 4b) with
   * unit-length vectors (equation 4a); vectors[j] is the jth eigenvector.
   */
  function jacobiEigen(Cin, J) {
    const A = Float64Array.from(Cin);
    const V = new Float64Array(J * J);
    for (let i = 0; i < J; i++) V[i * J + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < J; p++) for (let q = p + 1; q < J; q++) off += A[p * J + q] * A[p * J + q];
      if (off < 1e-22) break;
      for (let p = 0; p < J; p++) {
        for (let q = p + 1; q < J; q++) {
          const apq = A[p * J + q];
          if (Math.abs(apq) < 1e-24) continue;
          const theta = (A[q * J + q] - A[p * J + p]) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
          for (let k = 0; k < J; k++) {
            const akp = A[k * J + p], akq = A[k * J + q];
            A[k * J + p] = c * akp - sn * akq;
            A[k * J + q] = sn * akp + c * akq;
          }
          for (let k = 0; k < J; k++) {
            const apk = A[p * J + k], aqk = A[q * J + k];
            A[p * J + k] = c * apk - sn * aqk;
            A[q * J + k] = sn * apk + c * aqk;
          }
          for (let k = 0; k < J; k++) {
            const vkp = V[k * J + p], vkq = V[k * J + q];
            V[k * J + p] = c * vkp - sn * vkq;
            V[k * J + q] = sn * vkp + c * vkq;
          }
        }
      }
    }
    const idx = [];
    for (let i = 0; i < J; i++) idx.push(i);
    idx.sort((a, b) => A[b * J + b] - A[a * J + a]);
    const values = new Float64Array(J);
    const vectors = [];
    idx.forEach((src, j) => {
      values[j] = Math.max(0, A[src * J + src]);
      const v = new Float64Array(J);
      for (let k = 0; k < J; k++) v[k] = V[k * J + src];
      vectors.push(v);
    });
    return { values, vectors };
  }

  /**
   * Outer-product similarity, equation 12: c = (r' C r) / Etot.
   *
   * The test vector r selects which member of the family you get. With r set
   * to the first eigenvector this is eigenstructure coherence; with r set to
   * J equal components of J^-1/2 it is a semblance estimate of coherence
   * (equation 13); AASPI also allows r to be the sample vector through the
   * analysis point.
   */
  function outerProduct(C, J, r, Etot) {
    let num = 0;
    for (let m = 0; m < J; m++) {
      for (let n = 0; n < J; n++) num += r[m] * C[m * J + n] * r[n];
    }
    return Etot > 1e-20 ? num / Etot : 0;
  }

  const constantTestVector = (J) => {
    const r = new Float64Array(J), v = 1 / Math.sqrt(J);
    for (let i = 0; i < J; i++) r[i] = v;
    return r;
  };

  // eigenstructure coherence, equation 9 (Gersztenkorn and Marfurt, 1999)
  function eigenCoherence(values) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    return sum > 1e-20 ? values[0] / sum : 0;
  }

  /**
   * Energy-ratio coherence, equation 10: the energy of the Karhunen-Loeve
   * filtered data over the total energy in the window.
   *
   * Because the eigenvectors are orthonormal, the energy retained by keeping
   * the first L principal components (equations 5, 6 and 8) is the sum of the
   * first L eigenvalues, so this reduces to a ratio of eigenvalue sums. With
   * L=1 and an untapered window it is numerically identical to equation 9;
   * the extra generality AASPI refers to is L>1 and the tapered, balanced
   * windows used for data-adaptive analysis.
   */
  function energyRatio(values, L) {
    const nKeep = Math.max(1, Math.min(L || 1, values.length));
    let coh = 0, tot = 0;
    for (let i = 0; i < values.length; i++) {
      tot += values[i];
      if (i < nKeep) coh += values[i];
    }
    return tot > 1e-20 ? coh / tot : 0;
  }

  /**
   * Sobel-filter similarity, equation 15, reduced to a single lateral
   * direction. AASPI computes inline and crossline derivatives; on a 2D line
   * only the inline term exists.
   *
   * As published, this returns a value near 0 where the traces are identical
   * and near 1 across an edge, so it is an edge response rather than a
   * similarity. See the module notes on the sign convention.
   */
  function sobelEdge(d, dH, J, K) {
    // central-difference derivative across traces, the smallest Sobel stencil
    const deriv = (arr, k) => {
      let g = 0;
      for (let j = 1; j < J - 1; j++) g += (arr[(j + 1) * K + k] - arr[(j - 1) * K + k]) / 2;
      return g;
    };
    const derivAbs = (arr, k) => {
      let g = 0;
      for (let j = 1; j < J - 1; j++) {
        g += (Math.abs(arr[(j + 1) * K + k]) + Math.abs(arr[(j - 1) * K + k])) / 2;
      }
      return g;
    };
    let num = 0, den = 0;
    for (let k = 0; k < K; k++) {
      const a = deriv(d, k), b = deriv(dH, k);
      num += a * a + b * b;
      const p = derivAbs(d, k), q = derivAbs(dH, k);
      den += p * p + q * q;
    }
    return den > 1e-20 ? Math.sqrt(num) / Math.sqrt(den) : 0;
  }

  /* ---------------------------------------------------------------------
     COHERENCE, THE CHEAP WAY

     Semblance over a window, computed either along a supplied dip field or
     along a flat window. This is not the energy-ratio similarity of program
     similarity3d; it is the semblance coherence of Marfurt et al. (1998),
     which is the same thing the dip scan maximizes and is therefore free
     once the scan has been run. Its only job here is to show what happens
     to a coherence volume when the window is steered and when it is not.
     --------------------------------------------------------------------- */

  function cohField(field, nx, nt, opts) {
    const o = opts || {};
    const half = o.half === undefined ? 2 : o.half;
    const kHalf = o.kHalf === undefined ? 5 : o.kHalf;
    const dx = o.decX || 2, dt = o.decT || 2;
    const grid = o.grid || null;                 // null means a flat window
    const J = 2 * half + 1, K = 2 * kHalf + 1;
    const buf = new Float64Array(J * K);
    const gx = Math.ceil(nx / dx), gt = Math.ceil(nt / dt);
    const c = new Float32Array(gx * gt);
    for (let a = 0; a < gx; a++) {
      const ix = Math.min(nx - 1, a * dx);
      for (let b = 0; b < gt; b++) {
        const it = Math.min(nt - 1, b * dt);
        const p = grid ? sampleGrid(grid, grid.p, ix, it) : 0;
        gatherAlongDip(field, nx, nt, ix, it, p, half, kHalf, buf);
        c[a * gt + b] = semblance(buf, J, K);
      }
    }
    return { c, gx, gt, decX: dx, decT: dt };
  }

  /* ---------------------------------------------------------------------
     COLOR MAPS FOR ATTRIBUTES

     Attribute displays have their own conventions, and they matter. Dip is
     signed, so it needs a diverging map with a neutral centre. Coherence runs
     0 to 1 and is shown with low values dark, because faults are what you are
     looking for and they should read as the ink on the page.
     --------------------------------------------------------------------- */

  function ramp(stops, signed) {
    return function (u) {
      const v = signed ? (Math.max(-1, Math.min(1, u)) + 1) / 2
                       : Math.max(0, Math.min(1, u));
      const q = v * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(q)), f = q - i;
      const a = stops[i], b = stops[i + 1];
      return [Math.round(a[0] + (b[0] - a[0]) * f),
              Math.round(a[1] + (b[1] - a[1]) * f),
              Math.round(a[2] + (b[2] - a[2]) * f)];
    };
  }

  /* Azimuth runs 0 to 360 and then starts again, so a ramp with different
     colors at its two ends draws a discontinuity that is not in the data.
     This one returns to where it started. */
  function cyclicRamp(stops) {
    return function (u) {
      const v = u - Math.floor(u);
      const q = v * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(q)), f = q - i;
      const a = stops[i], b = stops[i + 1];
      return [Math.round(a[0] + (b[0] - a[0]) * f),
              Math.round(a[1] + (b[1] - a[1]) * f),
              Math.round(a[2] + (b[2] - a[2]) * f)];
    };
  }

  const MAPS = {
    // signed dip: brown for one direction, teal for the other, pale at flat.
    // Avoids red/green, and the two ends are told apart by lightness as well
    // as hue so it survives greyscale printing.
    dip: ramp([
      [92, 48, 12], [150, 96, 32], [205, 165, 105], [246, 244, 238],
      [140, 197, 200], [46, 132, 150], [16, 62, 88],
    ], true),
    // coherence: 1 is white, 0 is black. Discontinuities are the ink.
    coherence: ramp([
      [8, 10, 12], [58, 62, 68], [122, 128, 134], [190, 194, 198], [252, 252, 250],
    ], false),
    // dip azimuth: cyclic, so 359 degrees and 1 degree look nearly the same
    azimuth: cyclicRamp([
      [196, 60, 45], [214, 150, 60], [150, 172, 84], [46, 132, 150],
      [96, 96, 164], [172, 74, 124], [196, 60, 45],
    ]),
    // semblance during a scan, warm so it reads against the crimson accent
    scan: ramp([
      [252, 250, 246], [253, 231, 160], [247, 190, 90], [233, 131, 60],
      [196, 60, 45], [110, 16, 20],
    ], false),
  };

  /* --------------------------------------------------------------------- */

  return {
    semblance, gatherAlongDip, dipScan, dipField, sampleGrid, cohField,
    gatherAlongDip3D, dipScan3D,
    covarianceAnalytic, totalEnergy, jacobiEigen, outerProduct, constantTestVector,
    eigenCoherence, energyRatio, sobelEdge,
    perTraceToPerMetre, dipMagAzim, apparentDip, gradientToDegrees,
    dipToMsPerTrace, dipToDegrees, degToDip, MAPS, ramp, cyclicRamp,
  };
})();
