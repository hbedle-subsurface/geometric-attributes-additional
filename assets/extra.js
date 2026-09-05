/* ===========================================================================
   extra.js — the four additional AASPI programs
   "More Geometric Attributes, and How They Actually Work"
   Heather Bedle and April Moreno-Ward / AASPI / University of Oklahoma

   Companion to seismic.js (wavelets, canvases, color maps) and attributes.js
   (semblance, dip scans, eigen-coherence). This file holds the algorithms that
   the second set of modules teaches:

       sof3d           structure-oriented filtering, and the edge preservation
                       that keeps it from smearing the faults away
       disorder        a volumetric signal-to-noise estimate
       glcm3d          gray-level co-occurrence matrices and their textures
       nonparallelism  statistics of vector dip and of energy gradient

   Everything is written the way the AASPI documentation writes it rather than
   in any optimized form, so a student can read the code beside the equation.
   Where the documentation gives a 3D form and a module works in 2D, the 2D
   version is marked as such rather than quietly substituted.
   =========================================================================== */

const EXTRA = (function () {
  'use strict';

  const EPS = 1e-12;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =======================================================================
     PART 1 — FILTERS ALONG STRUCTURAL DIP   (program sof3d)

     Every one of these takes a list of values gathered along a dipping plane
     through the analysis point and returns one number to put back at that
     point. What separates them is only how they decide which of the values to
     believe.
     ======================================================================= */

  /** Plain mean: every sample in the window counts the same. */
  function meanOf(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i];
    return s / (v.length || 1);
  }

  function stdOf(v) {
    const m = meanOf(v);
    let s = 0;
    for (let i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m);
    return Math.sqrt(s / (v.length || 1));
  }

  /**
   * Alpha-trimmed mean. Sort the J values, throw away alpha*(J-1) of them from
   * each end, average what is left:
   *
   *     u = 1/(J - 2a(J-1)) * sum from j = 1+a(J-1) to J-a(J-1) of u_j
   *
   * alpha = 0 gives the mean, because nothing is discarded. alpha = 0.5 gives
   * the median, because everything but the middle value is discarded. The
   * useful settings are in between, which is the whole reason the filter
   * exists: a spike gets thrown out without giving up the averaging that
   * suppresses random noise.
   */
  function alphaTrim(values, alpha) {
    const u = Array.prototype.slice.call(values).sort((a, b) => a - b);
    const J = u.length;
    if (J === 0) return 0;
    const a = clamp(alpha, 0, 0.5);
    const drop = Math.floor(a * (J - 1));
    const lo = drop, hi = J - 1 - drop;
    let s = 0, n = 0;
    for (let j = lo; j <= hi; j++) { s += u[j]; n++; }
    return n ? s / n : u[(J - 1) >> 1];
  }

  function median(values) { return alphaTrim(values, 0.5); }

  /**
   * Lower-upper-middle (LUM) filter. Keep the value that is already at the
   * analysis point unless it falls outside the trimmed range, in which case
   * pull it back to whichever end of that range it fell past:
   *
   *     u_LUM = median( u_{1+a(J-1)},  u*,  u_{J-a(J-1)} )
   *
   * where u* is the original center value. It does nothing at all to a sample
   * the window agrees with, which is what keeps LUM sharp where the mean and
   * the alpha-trimmed mean are soft.
   */
  function lum(values, center, alpha) {
    const u = Array.prototype.slice.call(values).sort((a, b) => a - b);
    const J = u.length;
    if (J === 0) return center;
    const drop = Math.floor(clamp(alpha, 0, 0.5) * (J - 1));
    const lo = u[drop], hi = u[J - 1 - drop];
    return center < lo ? lo : (center > hi ? hi : center);
  }

  /**
   * Principal-component (Karhunen-Loeve) filter.
   *
   * Unlike the three above, this one uses the whole 3D window rather than the
   * single dipping plane through the analysis point. Build the covariance
   * matrix between traces,
   *
   *     C_mn = sum over k of [ d(t_k,x_m) d(t_k,x_n) + d^H(t_k,x_m) d^H(t_k,x_n) ]
   *
   * find its first eigenvector v, and reconstruct each trace as its projection
   * onto that eigenvector:
   *
   *     d_PC(x_n) = [ sum over m of v_m d(x_m) ] v_n
   *
   * In words: find the one waveform that best explains every trace in the
   * window at once, and keep only the part of each trace that looks like it.
   * The Hilbert-transform term is what makes the estimate insensitive to where
   * the window happens to be centered on the wavelet.
   *
   * traces: array of J arrays of length K, already gathered along dip. hilb is
   * the matching Hilbert transform, or omitted. Returns { filtered, eigvec }:
   * `filtered` is the whole reconstructed window, same shape as `traces`, and
   * `eigvec` is the waveform weighting the reconstruction used. Callers wanting
   * one value take filtered[trace][sample].
   */
  function pcFilter(traces, hilb) {
    const J = traces.length;
    if (J === 0) return { filtered: [], eigvec: new Float64Array(0) };
    const K = traces[0].length;
    // covariance between traces, summed down the vertical window
    const C = [];
    for (let m = 0; m < J; m++) {
      C.push(new Float64Array(J));
      for (let n = 0; n < J; n++) {
        let s = 0;
        for (let k = 0; k < K; k++) {
          s += traces[m][k] * traces[n][k];
          if (hilb) s += hilb[m][k] * hilb[n][k];
        }
        C[m][n] = s;
      }
    }
    // first eigenvector by power iteration; the matrix is small and symmetric
    let v = new Float64Array(J).fill(1 / Math.sqrt(J));
    for (let iter = 0; iter < 40; iter++) {
      const w = new Float64Array(J);
      for (let m = 0; m < J; m++) {
        let s = 0;
        for (let n = 0; n < J; n++) s += C[m][n] * v[n];
        w[m] = s;
      }
      let nrm = 0;
      for (let m = 0; m < J; m++) nrm += w[m] * w[m];
      nrm = Math.sqrt(nrm);
      if (nrm < EPS) break;
      for (let m = 0; m < J; m++) v[m] = w[m] / nrm;
    }
    // project every sample of the window onto that single waveform
    const out = [];
    for (let j = 0; j < J; j++) out.push(new Float32Array(K));
    for (let k = 0; k < K; k++) {
      let proj = 0;
      for (let m = 0; m < J; m++) proj += v[m] * traces[m][k];
      for (let n = 0; n < J; n++) out[n][k] = proj * v[n];
    }
    return { filtered: out, eigvec: v };
  }

  /**
   * Fehmers and Hocker (2003) edge weighting, as AASPI states it.
   *
   *     s < s_low                 w = 0     do not filter at all
   *     s_low < s < s_high        w = (s - s_low)/(s_high - s_low)
   *     s > s_high                w = 1     filter fully
   *
   * and the output is the blend  d_out = w*d_filt + (1-w)*d_orig.
   *
   * The point is that the edge is where the coherence is low, and an edge is
   * signal. Smoothing across it would remove the fault you were looking for.
   */
  function edgeWeight(s, slow, shigh) {
    if (shigh <= slow) return s >= shigh ? 1 : 0;
    if (s <= slow) return 0;
    if (s >= shigh) return 1;
    return (s - slow) / (shigh - slow);
  }

  /**
   * Kuwahara window selection.
   *
   * Every candidate window is the same size and every one of them contains the
   * analysis point, but only one of them is centered on it. Score each and
   * keep the best: Luo et al. (2002) score by smallest standard deviation,
   * Marfurt (2006) by highest coherence. Either way the window that straddles
   * an edge loses, so the value that gets written back comes from one side of
   * the edge instead of from an average across it.
   *
   * score(shift) must return a number; `higherIsBetter` says which way to read
   * it. Returns the winning shift.
   *
   * scenter is the AASPI safety valve: where the data are already coherent
   * there is no edge to preserve, so the centered window is used and the image
   * does not acquire the blocky, patchy look that an unrestrained Kuwahara
   * filter gives smooth data.
   */
  function kuwaharaPick(shifts, score, higherIsBetter, s, scenter) {
    if (scenter !== undefined && s >= scenter) return 0;
    let best = 0, bestVal = higherIsBetter ? -Infinity : Infinity;
    for (let i = 0; i < shifts.length; i++) {
      const val = score(shifts[i]);
      if (higherIsBetter ? val > bestVal : val < bestVal) { bestVal = val; best = i; }
    }
    return shifts[best];
  }

  /* =======================================================================
     PART 2 — DISORDER   (program disorder)

     A 3x3x3 second-difference operator applied along structural dip, and then
     normalized so the answer says nothing about how loud the data are:

         L = outer product of [1, -2, 1] with itself three times

         disorder = | L . e | / ( ||L|| ||e|| + eps )

     L is a second derivative in all three directions at once, so it is blind
     to anything smooth and wide awake to anything rough. Dividing by the two
     lengths turns the dot product into a cosine, which is why a strong, noisy
     reflector and a weak, noisy one give the same answer.

     Al-Dossary et al. (2014). AASPI then hands the result to stat3d, which
     takes its standard deviation along dip over a second window; that step is
     what turns a per-sample number into a mappable one.
     ======================================================================= */

  /** The 27 coefficients, in [k][m][n] order. Separable: a_i a_j a_k. */
  const DISORDER_KERNEL = (function () {
    const a = [1, -2, 1];
    const L = [];
    for (let k = 0; k < 3; k++) {
      const plane = [];
      for (let m = 0; m < 3; m++) {
        const row = [];
        for (let n = 0; n < 3; n++) row.push(a[k] * a[m] * a[n]);
        plane.push(row);
      }
      L.push(plane);
    }
    return L;
  })();

  const DISORDER_NORM = (function () {
    let s = 0;
    for (let k = 0; k < 3; k++) for (let m = 0; m < 3; m++) for (let n = 0; n < 3; n++) {
      s += DISORDER_KERNEL[k][m][n] * DISORDER_KERNEL[k][m][n];
    }
    return Math.sqrt(s);          // = 6^(3/2) = 14.697
  })();

  /**
   * Disorder from 27 values already gathered along dip, in the same [k][m][n]
   * order as the kernel. Returns a number between 0 and 1.
   */
  function disorderAt(e27) {
    let dot = 0, en = 0, i = 0;
    for (let k = 0; k < 3; k++) for (let m = 0; m < 3; m++) for (let n = 0; n < 3; n++) {
      const v = e27[i++];
      dot += DISORDER_KERNEL[k][m][n] * v;
      en += v * v;
    }
    return Math.abs(dot) / (DISORDER_NORM * Math.sqrt(en) + EPS);
  }

  /** The 2D form the section modules use: a 3x3 operator, same normalization. */
  function disorder2D(e9) {
    const a = [1, -2, 1];
    let dot = 0, en = 0, nrm = 0, i = 0;
    for (let m = 0; m < 3; m++) for (let n = 0; n < 3; n++) {
      const c = a[m] * a[n], v = e9[i++];
      dot += c * v; en += v * v; nrm += c * c;
    }
    return Math.abs(dot) / (Math.sqrt(nrm) * Math.sqrt(en) + EPS);
  }

  /* =======================================================================
     PART 3 — GRAY-LEVEL CO-OCCURRENCE MATRICES   (program glcm3d)

     Texture is what a surface would feel like if amplitude were elevation.
     Measuring it needs a step the other attributes never take: throw away the
     amplitudes and keep only their rank. What is left is a picture of which
     brightnesses sit next to which, and every texture attribute is a different
     way of summarizing that picture.
     ======================================================================= */

  /**
   * Scale a window of data to integer gray levels.
   *
   * Seismic amplitude is signed, so the scale is centered rather than run from
   * zero upward: zero amplitude lands on the middle level, +1.5 sigma on the
   * top level and -1.5 sigma on the bottom one.
   *
   *     level = CLIP( (L-1)/2 * [ 1 + d / (1.5 sigma + eps) ] )
   *
   * sigma is the RMS of the window, taken about zero rather than about the
   * window's own mean, which is what keeps zero amplitude on the middle level
   * however the window happens to average. It is therefore not the standard
   * deviation, and the two separate on any window that does not average to
   * zero. The scaling is relative to how loud this piece of data happens to
   * be, and the clip at 1.5 sigma
   * means the loudest few percent of samples all land in an end level rather
   * than stretching the scale for everyone else. Samples past the clip are
   * assigned the end level rather than discarded, so the pair count does not
   * depend on how many outliers the window happens to hold.
   *
   * Returns Int32Array of levels in [0, L-1].
   */
  function quantize(values, L, clipSigma) {
    const cs = clipSigma || 1.5;
    let ss = 0;
    for (let i = 0; i < values.length; i++) ss += values[i] * values[i];
    const sigma = Math.sqrt(ss / (values.length || 1));
    const half = (L - 1) / 2;
    const out = new Int32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const scaled = (values[i] / (cs * sigma + EPS)) * half;
      out[i] = clamp(Math.round(half + scaled), 0, L - 1);
    }
    return { levels: out, sigma: sigma };
  }

  /**
   * Build the co-occurrence matrix for one horizontal slice of quantized data.
   *
   *     p_ij = count of neighboring pairs whose levels are i and j
   *
   * AASPI counts four directions at once - east, northeast, north and
   * northwest - so the result does not depend on which way the feature happens
   * to run. Set `dirs` to a subset to see what a single direction does.
   *
   * lev: Int32Array of nx*ny levels. Returns an L*L Float64Array, normalized
   * to sum to one, plus the raw pair count.
   */
  const GLCM_DIRS = [
    { dx: 1, dy: 0, name: 'east' },
    { dx: 1, dy: 1, name: 'northeast' },
    { dx: 0, dy: 1, name: 'north' },
    { dx: -1, dy: 1, name: 'northwest' },
  ];

  function coOccurrence(lev, nx, ny, L, dirs, symmetric) {
    const use = dirs || GLCM_DIRS;
    const P = new Float64Array(L * L);
    let n = 0;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = lev[y * nx + x];
        for (let d = 0; d < use.length; d++) {
          const X = x + use[d].dx, Y = y + use[d].dy;
          if (X < 0 || X >= nx || Y < 0 || Y >= ny) continue;
          const j = lev[Y * nx + X];
          P[i * L + j] += 1; n++;
          if (symmetric !== false) { P[j * L + i] += 1; n++; }
        }
      }
    }
    if (n > 0) for (let k = 0; k < P.length; k++) P[k] /= n;
    return { P: P, pairs: n };
  }

  /**
   * The Haralick measures, in the AASPI forms. Each takes the normalized
   * matrix and returns one number.
   *
   *     C = sum P_ij (i-j)^2                 contrast
   *     D = sum P_ij |i-j|                   dissimilarity
   *     H = sum P_ij / (1 + (i-j)^2)         homogeneity
   *     E = [ sum P_ij^2 ]^(1/2)             energy (an orderliness measure,
   *                                          not a strength measure)
   *     S = - sum P_ij ln P_ij               entropy
   *     mu = sum j P_ij                      mean level
   *     V = sum P_ij (i - mu)^2              variance
   *     R = (1/V) sum P_ij (i-mu)(j-mu)      correlation
   *
   * The first three are all "how far off the diagonal is the matrix", weighted
   * three different ways: by the square of the distance, by the distance, and
   * by the reciprocal of it. That is why contrast, dissimilarity and
   * homogeneity so often look like each other, and like coherence.
   *
   * AASPI computes each of these on the data and on its Hilbert transform and
   * adds the two; pass a second matrix as PH to do that.
   *
   * One assumption to know if you reuse this. Variance and correlation are
   * written with a single mean mu, taken over j, and used for the i deviation
   * as well. That is exact for a symmetric matrix, which is what coOccurrence
   * returns by default and what every caller here passes. On a matrix built
   * with symmetric:false the two marginal means differ and both quantities
   * would need their own.
   */
  function haralick(P, L, PH) {
    const has = !!PH;
    let C = 0, D = 0, H = 0, E = 0, EH = 0, S = 0, mu = 0, muH = 0;
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        const p = P[i * L + j], ph = has ? PH[i * L + j] : 0;
        const d = i - j, both = p + ph;
        C += both * d * d;
        D += both * Math.abs(d);
        H += both / (1 + d * d);
        E += p * p; if (has) EH += ph * ph;
        if (p > 0) S -= p * Math.log(p);
        if (has && ph > 0) S -= ph * Math.log(ph);
        mu += j * p; if (has) muH += j * ph;
      }
    }
    let V = 0;
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        const p = P[i * L + j], ph = has ? PH[i * L + j] : 0;
        V += p * (i - mu) * (i - mu);
        if (has) V += ph * (i - muH) * (i - muH);
      }
    }
    let R = 0;
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        const p = P[i * L + j], ph = has ? PH[i * L + j] : 0;
        R += p * (i - mu) * (j - mu);
        if (has) R += ph * (i - muH) * (j - muH);
      }
    }
    /* Correlation is a ratio, so with the Hilbert term on it is pooled — the
       summed cross term over the summed variance — rather than computed twice
       and added the way the additive measures above are. Pooling is the
       sensible reading of a normalized quantity, but it is a choice, and it is
       the one place in this function where "compute both and add" does not
       describe what happens. */
    R = V > EPS ? R / V : 0;
    return {
      contrast: C, dissimilarity: D, homogeneity: H,
      energy: Math.sqrt(E) + (has ? Math.sqrt(EH) : 0),
      entropy: S, mean: mu + (has ? muH : 0), variance: V, correlation: R,
    };
  }

  /* =======================================================================
     PART 4 — NONPARALLELISM   (program nonparallelism)

     Two statistics of the neighborhood, and one number that combines them.

     Deviation of vector dip. Turn each dip estimate into a unit vector normal
     to the reflector,

         p = dz/dx,  q = dz/dy
         n = (p, q, 1) / (p^2 + q^2 + 1)^(1/2)

     take the energy-weighted mean of those vectors, and measure how far the
     individual vectors scatter around it:

         mu_k     = sum_j e_j n_kj / sum_j e_j
         sigma_n  = { sum_j e_j sum_k (n_kj - mu_k)^2 / sum_j e_j }^(1/2)
         sigma_dip = arcsin(sigma_n)

     Parallel reflectors give a tight cluster of normals and a small number. A
     chaotic package - salt, a mass transport complex, a collapsed karst - gives
     normals pointing everywhere and a large one.

     Deviation of energy gradient. The same scatter measurement applied to the
     lateral gradient of reflection strength rather than to dip, rotated into
     the plane of the reflector:

         g_xi = cos(theta_x) g_x,   g_eta = cos(theta_y) g_y

     Covariance of the two. A 2x2 matrix of the normalized deviations and their
     cross terms; the attribute is its larger eigenvalue,

         lambda_1 = [ (a+d) + ((a+d)^2 - 4(ad - bc))^(1/2) ] / 2

     Read that carefully, because it is easy to state it backwards. The larger
     eigenvalue of a 2x2 matrix with non-negative diagonal is never smaller
     than the larger diagonal entry, so lambda_1 is high wherever EITHER
     deviation is high, and highest where both are. It does not stay quiet when
     only one of them fires, and no eigenvalue of a covariance matrix could.
     What the merge buys is one map instead of two; what it costs is that a
     bright anomaly no longer says which measurement produced it. That trade is
     the subject of module 06 step 4.
     ======================================================================= */

  /* Unit normal to a reflector with inline dip p and crossline dip q.
     Written (p, q, 1) rather than (-p, -q, 1), so it points the opposite way to
     the textbook normal of a surface z = f(x, y). Nothing downstream notices:
     every use is a scatter about a mean of these same vectors, and flipping all
     of them flips the mean with them. */
  function unitNormal(p, q) {
    const den = Math.sqrt(p * p + q * q + 1);
    return [p / den, q / den, 1 / den];
  }

  /**
   * Deviation of vector dip over a neighborhood.
   * p, q: arrays of the inline and crossline dip components in the window.
   * e:    matching array of energies (or RMS amplitudes) used as weights.
   * Returns { sigmaN, sigmaDipDeg, mean }.
   */
  function dipDeviation(p, q, e) {
    const J = p.length;
    let we = 0;
    const mu = [0, 0, 0];
    for (let j = 0; j < J; j++) {
      const n = unitNormal(p[j], q[j]);
      const w = e ? e[j] : 1;
      mu[0] += w * n[0]; mu[1] += w * n[1]; mu[2] += w * n[2];
      we += w;
    }
    if (we < EPS) return { sigmaN: 0, sigmaDipDeg: 0, mean: [0, 0, 1] };
    mu[0] /= we; mu[1] /= we; mu[2] /= we;
    let s = 0;
    for (let j = 0; j < J; j++) {
      const n = unitNormal(p[j], q[j]);
      const w = e ? e[j] : 1;
      s += w * ((n[0] - mu[0]) * (n[0] - mu[0])
              + (n[1] - mu[1]) * (n[1] - mu[1])
              + (n[2] - mu[2]) * (n[2] - mu[2]));
    }
    const sigmaN = Math.sqrt(s / we);
    return {
      sigmaN: sigmaN,
      sigmaDipDeg: Math.asin(clamp(sigmaN, 0, 1)) * 180 / Math.PI,
      mean: mu,
    };
  }

  /**
   * Deviation of energy gradient. gx, gy are the inline and crossline gradients
   * of energy (or RMS amplitude); p, q the dip components used to rotate them
   * into the plane of the reflector.
   */
  function gradientDeviation(gx, gy, p, q) {
    const J = gx.length;
    const gxi = new Float64Array(J), geta = new Float64Array(J);
    for (let j = 0; j < J; j++) {
      // cos(theta) = 1/(1+tan^2)^(1/2), and tan(theta_x) = p
      gxi[j] = gx[j] / Math.sqrt(1 + p[j] * p[j]);
      geta[j] = gy[j] / Math.sqrt(1 + q[j] * q[j]);
    }
    let vx = 0, vy = 0;
    for (let j = 0; j < J; j++) { vx += gxi[j]; vy += geta[j]; }
    vx /= J; vy /= J;
    let s = 0;
    for (let j = 0; j < J; j++) {
      s += (gxi[j] - vx) * (gxi[j] - vx) + (geta[j] - vy) * (geta[j] - vy);
    }
    return { sigma: Math.sqrt(s / J), mean: [vx, vy], gxi: gxi, geta: geta };
  }

  /**
   * Covariance of vector dip and energy gradient. Rn and Rg are the
   * normalization constants that put the two very different quantities on a
   * common footing; the attribute is the larger eigenvalue of the 2x2 matrix.
   */
  /* A note on the cross term, because it is not an ordinary covariance.

     The diagonal entries a and d are mean SQUARED deviations, so they are
     non-negative by construction, and the off-diagonal is built as the mean of
     sqrt(|dn * dg|) rather than as a signed product of centered variables. It
     therefore cannot go negative and cannot report anti-correlation. What it
     measures is whether the two deviations are large at the same samples, not
     whether they move together with a sign.

     The consequence to know when reading the map: lambda_1 >= max(a, d)
     always, so the attribute cannot be quieter than its louder input. That is
     the behavior the module describes and the behavior AASPI describes. If you
     are comparing absolute values against a production nonparallelism volume,
     check this construction against the program documentation first. */
  function dipEnergyCovariance(p, q, e, gx, gy, Rn, Rg) {
    const J = p.length;
    const dd = dipDeviation(p, q, e);
    const gd = gradientDeviation(gx, gy, p, q);
    const rn = Rn || 1, rg = Rg || 1;
    let we = 0;
    for (let j = 0; j < J; j++) we += (e ? e[j] : 1);
    let a = 0, b = 0, c = 0, d = 0;
    for (let j = 0; j < J; j++) {
      const n = unitNormal(p[j], q[j]);
      const w = e ? e[j] : 1;
      const dn = ((n[0] - dd.mean[0]) * (n[0] - dd.mean[0])
                + (n[1] - dd.mean[1]) * (n[1] - dd.mean[1])
                + (n[2] - dd.mean[2]) * (n[2] - dd.mean[2])) / (rn * rn);
      const dgx = (gd.gxi[j] - gd.mean[0]) / rg;
      const dgy = (gd.geta[j] - gd.mean[1]) / rg;
      const dg = dgx * dgx + dgy * dgy;
      const cross = Math.sqrt(Math.abs(dn * dg));
      a += w * dn / (we || 1);
      d += dg / J;
      b += Math.sqrt(w) * cross / Math.sqrt(J * (we || 1));
    }
    c = b;
    const tr = a + d, det = a * d - b * c;
    const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
    return { lambda1: (tr + disc) / 2, lambda2: (tr - disc) / 2, a: a, b: b, c: c, d: d };
  }

  /* =======================================================================
     COLOR MAPS the second set needs and the first set did not have
     ======================================================================= */

  function ramp(stops) {
    return function (u) {
      const v = clamp(u, 0, 1);
      const q = v * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(q)), f = q - i;
      const a = stops[i], b = stops[i + 1];
      return [Math.round(a[0] + (b[0] - a[0]) * f),
              Math.round(a[1] + (b[1] - a[1]) * f),
              Math.round(a[2] + (b[2] - a[2]) * f)];
    };
  }

  /* Two versions of each diverging map. The default set is the one these
     modules were designed around: quiet green through to alarming red, which
     is how a confidence map is read at a glance and which most readers find
     immediate. It is also the set that fails for red-green color blindness.
     Simulating deuteranopia and protanopia on the green-to-red ramp shows why:
     its lightness is not monotonic, dark at the green end, bright in the middle
     and dark again at the red end, so the quiet end and the alarming end land
     at similar lightness and similar hue and the map stops being ordered.

     The alternative set keeps the same job and changes the axis. Sequential
     maps run dark blue to bright yellow, which is monotonic in lightness, so
     the order survives whatever the reader's color vision is doing. Diverging
     maps run blue to orange rather than blue to red, because the blue-yellow
     axis is the one that stays intact.

     Neither is forced on anyone. setColorVision swaps them in place, so every
     panel and every colorbar follows without a single call site changing. */
  const MAPS_ALT = {
    confidence: ramp([
      [24, 34, 78], [36, 72, 120], [74, 110, 132],
      [124, 148, 140], [186, 188, 130], [248, 232, 110],
    ]),
    chaos: ramp([
      [20, 52, 110], [64, 110, 170], [150, 190, 220], [246, 244, 238],
      [240, 196, 120], [206, 140, 44], [122, 74, 10],
    ]),
  };

  const MAPS = {
    // disorder and other "how bad is it" measures: quiet is green, bad is red,
    // which is how a confidence map is read at a glance
    confidence: ramp([
      [26, 108, 74], [96, 166, 90], [214, 214, 130],
      [232, 168, 68], [206, 92, 44], [140, 22, 24],
    ]),
    // texture measures: a perceptually even sequential ramp, because a texture
    // attribute has no meaningful zero to put in the middle
    texture: ramp([
      [252, 251, 245], [222, 224, 210], [174, 200, 190], [110, 168, 176],
      [58, 124, 152], [38, 74, 116], [26, 34, 68],
    ]),
    // the co-occurrence matrix itself: white where no pair was counted
    matrix: ramp([
      [255, 255, 253], [246, 224, 190], [238, 176, 110], [214, 108, 58],
      [160, 44, 38], [88, 12, 22],
    ]),
    // nonparallelism: blue where reflectors agree, red where they do not
    chaos: ramp([
      [32, 68, 130], [70, 130, 180], [168, 200, 216], [244, 240, 228],
      [232, 176, 120], [204, 96, 52], [132, 22, 23],
    ]),
  };

  const MAPS_STD = Object.assign({}, MAPS);

  /** 'standard' or 'cvd'. Mutates MAPS in place; nothing else has to know. */
  function setColorVision(mode) {
    Object.keys(MAPS_STD).forEach((k) => {
      MAPS[k] = (mode === 'cvd' && MAPS_ALT[k]) ? MAPS_ALT[k] : MAPS_STD[k];
    });
  }

  /* --------------------------------------------------------------------- */

  return {
    // sof3d
    meanOf, stdOf, alphaTrim, median, lum, pcFilter, edgeWeight, kuwaharaPick,
    // disorder
    DISORDER_KERNEL, DISORDER_NORM, disorderAt, disorder2D,
    // glcm3d
    quantize, coOccurrence, haralick, GLCM_DIRS,
    // nonparallelism
    unitNormal, dipDeviation, gradientDeviation, dipEnergyCovariance,
    // display
    MAPS, MAPS_ALT, MAPS_STD, setColorVision, ramp,
  };
})();

