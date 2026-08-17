/**
 * Multinomial Naive Bayes intent classifier over TF-IDF features.
 *
 * A genuinely trained model: it learns class priors and per-feature likelihoods
 * from the labeled corpus, rather than following hand-written rules. Written
 * from scratch (no ML library) so every step is inspectable.
 *
 * Pipeline:  tokenize -> n-grams -> TF-IDF -> Multinomial NB -> softmax
 */

import { tokenize } from '../prismEngine';
import { TRAINING_DATA, INTENT_LABELS } from './trainingData';

// ── Deterministic RNG ───────────────────────────────────────────────────────
// Seeded so training is reproducible — the same split and metrics every run.
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const shuffled = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ── Feature extraction ──────────────────────────────────────────────────────

/**
 * Unigrams plus bigrams. Bigrams matter here because short business queries
 * hinge on word pairs — "how many" (count) vs "how much" (value).
 */
export const featurize = (text) => {
  const tokens = tokenize(text);
  const grams = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) grams.push(`${tokens[i]}_${tokens[i + 1]}`);
  return grams;
};

// ── TF-IDF vectorizer ───────────────────────────────────────────────────────

export class TfidfVectorizer {
  constructor({ minBigramDf = 2, useIdf = true, norm = 'l2', scale = 1, sublinearTf = false } = {}) {
    this.opts = { minBigramDf, useIdf, norm, scale, sublinearTf };
    this.vocabulary = new Map(); // term -> column index
    this.idf = [];
  }

  fit(documents) {
    const docFreq = new Map();
    documents.map(featurize).forEach(grams => {
      new Set(grams).forEach(g => docFreq.set(g, (docFreq.get(g) || 0) + 1));
    });

    [...docFreq.entries()]
      .filter(([term, df]) => !term.includes('_') || df >= this.opts.minBigramDf)
      .forEach(([term], i) => this.vocabulary.set(term, i));

    const n = documents.length;
    this.idf = new Array(this.vocabulary.size).fill(1);
    if (this.opts.useIdf) {
      this.vocabulary.forEach((idx, term) => {
        // Smoothed IDF (as in scikit-learn): log((1+n)/(1+df)) + 1
        this.idf[idx] = Math.log((1 + n) / (1 + (docFreq.get(term) || 0))) + 1;
      });
    }
    return this;
  }

  /** Returns a sparse vector: Map<columnIndex, weight>. */
  transform(text) {
    const counts = new Map();
    featurize(text).forEach(g => {
      const idx = this.vocabulary.get(g);
      if (idx !== undefined) counts.set(idx, (counts.get(idx) || 0) + 1);
    });

    const vec = new Map();
    let l2 = 0, l1 = 0;
    counts.forEach((rawTf, idx) => {
      // Sublinear TF damps repeated terms: a word twice isn't twice as telling.
      const tf = this.opts.sublinearTf ? 1 + Math.log(rawTf) : rawTf;
      const w = tf * this.idf[idx];
      vec.set(idx, w);
      l2 += w * w; l1 += Math.abs(w);
    });

    const { norm, scale } = this.opts;
    const d = norm === 'l2' ? Math.sqrt(l2) : norm === 'l1' ? l1 : 1;
    if (d > 0) vec.forEach((w, idx) => vec.set(idx, (w / d) * scale));
    else if (scale !== 1) vec.forEach((w, idx) => vec.set(idx, w * scale));
    return vec;
  }
}

// ── Multinomial Naive Bayes ─────────────────────────────────────────────────

export class MultinomialNB {
  constructor(alpha = 1.0) {
    this.alpha = alpha; // Laplace/Lidstone smoothing
    this.classes = [];
    this.logPrior = [];
    this.logLikelihood = []; // [classIdx][featureIdx]
  }

  fit(vectors, labels, nFeatures) {
    this.classes = [...new Set(labels)].sort();
    const classIdx = new Map(this.classes.map((c, i) => [c, i]));
    const counts = new Array(this.classes.length).fill(0);
    // Accumulated TF-IDF mass per (class, feature)
    const featureSum = this.classes.map(() => new Float64Array(nFeatures));

    vectors.forEach((vec, i) => {
      const ci = classIdx.get(labels[i]);
      counts[ci]++;
      vec.forEach((w, fi) => { featureSum[ci][fi] += w; });
    });

    this.logPrior = counts.map(c => Math.log(c / labels.length));

    this.logLikelihood = featureSum.map(row => {
      let total = 0;
      for (let i = 0; i < nFeatures; i++) total += row[i];
      const denom = total + this.alpha * nFeatures;
      const out = new Float64Array(nFeatures);
      for (let i = 0; i < nFeatures; i++) out[i] = Math.log((row[i] + this.alpha) / denom);
      return out;
    });
    return this;
  }

  /** Log-scores per class for a sparse feature vector. */
  decisionFunction(vec) {
    return this.classes.map((_, ci) => {
      let score = this.logPrior[ci];
      vec.forEach((w, fi) => { score += w * this.logLikelihood[ci][fi]; });
      return score;
    });
  }

  predictProba(vec) {
    const scores = this.decisionFunction(vec);
    const max = Math.max(...scores);
    const exp = scores.map(s => Math.exp(s - max)); // softmax, shifted for stability
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(e => e / sum);
  }

  predict(vec) {
    const proba = this.predictProba(vec);
    let best = 0;
    for (let i = 1; i < proba.length; i++) if (proba[i] > proba[best]) best = i;
    return { label: this.classes[best], confidence: proba[best], proba };
  }
}

/**
 * Complement Naive Bayes (Rennie et al., 2003).
 *
 * Standard Multinomial NB estimates P(feature | class) from that class's own
 * documents, so classes whose vocabulary overlaps a larger neighbour get
 * swamped — here, `profit` losing to `revenue_total`. CNB instead estimates
 * each class's weights from the *complement* (every document NOT in the class)
 * and picks the class whose complement fits worst. That is far more stable when
 * classes share words, which is exactly this corpus's problem.
 *
 * Exposes the same interface as MultinomialNB so the two are interchangeable.
 */
export class ComplementNB {
  constructor(alpha = 1.0) {
    this.alpha = alpha;
    this.classes = [];
    this.weights = []; // [classIdx][featureIdx] — normalised complement weights
  }

  fit(vectors, labels, nFeatures) {
    this.classes = [...new Set(labels)].sort();
    const classIdx = new Map(this.classes.map((c, i) => [c, i]));

    // Per-class feature mass, plus the global total to derive complements from.
    const perClass = this.classes.map(() => new Float64Array(nFeatures));
    const global = new Float64Array(nFeatures);
    vectors.forEach((vec, i) => {
      const ci = classIdx.get(labels[i]);
      vec.forEach((w, fi) => { perClass[ci][fi] += w; global[fi] += w; });
    });

    this.weights = this.classes.map((_, ci) => {
      let complementTotal = 0;
      for (let i = 0; i < nFeatures; i++) complementTotal += global[i] - perClass[ci][i];

      const denom = complementTotal + this.alpha * nFeatures;
      const w = new Float64Array(nFeatures);
      let absSum = 0;
      for (let i = 0; i < nFeatures; i++) {
        w[i] = Math.log((global[i] - perClass[ci][i] + this.alpha) / denom);
        absSum += Math.abs(w[i]);
      }
      // Weight normalisation — the second correction in the CNB paper, which
      // stops long-vocabulary classes from dominating.
      if (absSum > 0) for (let i = 0; i < nFeatures; i++) w[i] /= absSum;
      return w;
    });
    return this;
  }

  /** Negated complement score, so larger is better — matching MultinomialNB. */
  decisionFunction(vec) {
    return this.classes.map((_, ci) => {
      let score = 0;
      vec.forEach((x, fi) => { score += x * this.weights[ci][fi]; });
      return -score;
    });
  }

  predictProba(vec) {
    const scores = this.decisionFunction(vec);
    const max = Math.max(...scores);
    const exp = scores.map(s => Math.exp(s - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(e => e / sum);
  }

  predict(vec) {
    const proba = this.predictProba(vec);
    let best = 0;
    for (let i = 1; i < proba.length; i++) if (proba[i] > proba[best]) best = i;
    return { label: this.classes[best], confidence: proba[best], proba };
  }
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export const evaluate = (yTrue, yPred, labels) => {
  const idx = new Map(labels.map((l, i) => [l, i]));
  const matrix = labels.map(() => new Array(labels.length).fill(0));
  let correct = 0;

  yTrue.forEach((t, i) => {
    matrix[idx.get(t)][idx.get(yPred[i])]++;
    if (t === yPred[i]) correct++;
  });

  const perClass = labels.map((label, i) => {
    const tp = matrix[i][i];
    const fn = matrix[i].reduce((s, v) => s + v, 0) - tp;
    const fp = matrix.reduce((s, row) => s + row[i], 0) - tp;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { label, precision, recall, f1, support: tp + fn };
  });

  const supported = perClass.filter(c => c.support > 0);
  return {
    accuracy: yTrue.length ? correct / yTrue.length : 0,
    macroF1: supported.length ? supported.reduce((s, c) => s + c.f1, 0) / supported.length : 0,
    perClass,
    matrix,
    labels,
    total: yTrue.length,
    correct,
  };
};

// ── Training orchestration ──────────────────────────────────────────────────

/** Stratified split so every intent appears in both train and test sets. */
const stratifiedSplit = (data, testRatio, rng) => {
  const byLabel = new Map();
  data.forEach(row => {
    if (!byLabel.has(row[1])) byLabel.set(row[1], []);
    byLabel.get(row[1]).push(row);
  });

  const train = [], test = [];
  byLabel.forEach(rows => {
    const s = shuffled(rows, rng);
    const nTest = Math.max(1, Math.round(s.length * testRatio));
    test.push(...s.slice(0, nTest));
    train.push(...s.slice(nTest));
  });
  return { train, test };
};

/**
 * Hyperparameters chosen by 5-fold cross-validated grid search over
 * norm x scale x alpha x minBigramDf (180 combinations).
 *
 * `scale` matters more than it looks: L2-normalised TF-IDF vectors sum to ~1,
 * which leaves the Naive Bayes log-scores so close together that softmax comes
 * out nearly uniform (every class ~10%). Scaling sharpens the posterior without
 * changing which class wins.
 *
 * scale=10 scored marginally higher raw accuracy but reported ~100% confidence
 * on every query — Naive Bayes' well-known overconfidence, made worse by a large
 * scale. scale=3 costs nothing measurable in accuracy and yields a usable
 * confidence spread, which matters because the number is shown to users.
 */
export const BEST_PARAMS = { norm: 'l2', scale: 3, alpha: 0.3, minBigramDf: 3 };

const fitPipeline = (rows, params = BEST_PARAMS) => {
  const vectorizer = new TfidfVectorizer(params).fit(rows.map(r => r[0]));
  const vectors = rows.map(r => vectorizer.transform(r[0]));
  const model = new MultinomialNB(params.alpha).fit(vectors, rows.map(r => r[1]), vectorizer.vocabulary.size);
  return { vectorizer, model };
};

/** K-fold cross-validation — a far more honest accuracy estimate on a small corpus. */
const crossValidate = (data, k, rng) => {
  const byLabel = new Map();
  data.forEach(row => {
    if (!byLabel.has(row[1])) byLabel.set(row[1], []);
    byLabel.get(row[1]).push(row);
  });

  const folds = Array.from({ length: k }, () => []);
  byLabel.forEach(rows => {
    shuffled(rows, rng).forEach((row, i) => folds[i % k].push(row));
  });

  const scores = [];
  for (let i = 0; i < k; i++) {
    const test = folds[i];
    const train = folds.filter((_, j) => j !== i).flat();
    if (!test.length || !train.length) continue;
    const { vectorizer, model } = fitPipeline(train);
    const pred = test.map(r => model.predict(vectorizer.transform(r[0])).label);
    const acc = pred.filter((p, j) => p === test[j][1]).length / test.length;
    scores.push(acc);
  }

  const mean = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
  const sd = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (scores.length || 1));
  return { scores, mean, sd, k };
};

/**
 * Train the classifier and return the fitted pipeline plus full evaluation.
 * Deterministic: the same seed always yields the same split and metrics.
 */
export function trainIntentModel({ seed = 42, testRatio = 0.25, folds = 5 } = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();

  const { train, test } = stratifiedSplit(TRAINING_DATA, testRatio, mulberry32(seed));
  const { vectorizer, model } = fitPipeline(train);

  const yTrue = test.map(r => r[1]);
  const predictions = test.map(r => model.predict(vectorizer.transform(r[0])));
  const metrics = evaluate(yTrue, predictions.map(p => p.label), INTENT_LABELS);

  const trainPred = train.map(r => model.predict(vectorizer.transform(r[0])).label);
  const trainMetrics = evaluate(train.map(r => r[1]), trainPred, INTENT_LABELS);

  const cv = crossValidate(TRAINING_DATA, folds, mulberry32(seed + 1));
  const t1 = (typeof performance !== 'undefined' ? performance : Date).now();

  return {
    vectorizer,
    model,
    metrics,
    trainAccuracy: trainMetrics.accuracy,
    cv,
    trainSize: train.length,
    testSize: test.length,
    vocabSize: vectorizer.vocabulary.size,
    classCount: model.classes.length,
    trainingMs: Math.round(t1 - t0),
    // Test rows the model got wrong — the most useful thing to inspect.
    errors: test
      .map((r, i) => ({ text: r[0], actual: r[1], predicted: predictions[i].label, confidence: predictions[i].confidence }))
      .filter(e => e.actual !== e.predicted),
  };
}

/**
 * Classify one query, with the features that drove the decision.
 * Exposing contributions keeps the model interpretable rather than a black box.
 */
export function classifyWithML(text, trained) {
  const { vectorizer, model } = trained;
  const vec = vectorizer.transform(text);
  const { label, confidence, proba } = model.predict(vec);
  const ci = model.classes.indexOf(label);

  const reverse = new Map([...vectorizer.vocabulary].map(([term, i]) => [i, term]));
  const contributions = [...vec.entries()]
    .map(([fi, w]) => ({ term: reverse.get(fi), weight: w * model.logLikelihood[ci][fi] }))
    .sort((a, b) => b.weight - a.weight) // least-negative = most supportive
    .slice(0, 5);

  const ranked = model.classes
    .map((c, i) => ({ label: c, probability: proba[i] }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);

  return { label, confidence, top: ranked, contributions, matchedFeatures: vec.size };
}
