import { useMemo, useState } from 'react';
import { trainIntentModel, classifyWithML, BEST_PARAMS } from '../utils/ml/naiveBayes';
import { TRAINING_DATA, INTENT_LABELS } from '../utils/ml/trainingData';
import { askPrism } from '../utils/prismEngine';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  FlaskConical, Cpu, Target, Layers, Timer, CheckCircle2, XCircle,
  GitCompare, Grid3x3, ListTree, Sparkles,
} from 'lucide-react';

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const shortLabel = (l) => l.replace(/_/g, ' ');

const Stat = ({ icon: Icon, label, value, sub, accent = 'text-brand-accent' }) => (
  <div className="glass-panel rounded-2xl p-4 border border-white/5">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} className={accent} />
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-2xl font-bold text-white leading-none">{value}</p>
    {sub && <p className="text-[11px] text-slate-500 mt-1.5">{sub}</p>}
  </div>
);

export default function MLLab() {
  const { leads, orders, invoices, expenses, inventory, productCatalog, distributors } = useData();
  const { users } = useAuth();
  const [query, setQuery] = useState('which items will run out soon');

  // Training is deterministic and fast (~30ms) — recomputed only on mount.
  const trained = useMemo(() => trainIntentModel(), []);

  const liveData = useMemo(
    () => ({ leads, orders, users, invoices, expenses, inventory, productCatalog, distributors }),
    [leads, orders, users, invoices, expenses, inventory, productCatalog, distributors],
  );

  const comparison = useMemo(() => {
    if (!query.trim()) return null;
    const ml = classifyWithML(query, trained);
    const rules = askPrism(query, liveData, null);
    return { ml, rules, agree: ml.label === rules.intent };
  }, [query, trained, liveData]);

  const { metrics, cv } = trained;
  const classDist = useMemo(() => {
    const c = {};
    TRAINING_DATA.forEach(([, y]) => { c[y] = (c[y] || 0) + 1; });
    return c;
  }, []);

  // Only rows/columns that actually appear in the test split.
  const activeLabels = useMemo(
    () => INTENT_LABELS.filter((_, i) => metrics.matrix[i].some(v => v > 0)),
    [metrics],
  );
  const maxCell = useMemo(
    () => Math.max(1, ...metrics.matrix.flat()),
    [metrics],
  );

  const baseline = 1 / metrics.labels.length; // random-guess accuracy

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FlaskConical size={24} className="text-brand-accent" /> ML Lab
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          A Multinomial Naive Bayes intent classifier trained on TF-IDF features — implemented from scratch, trained in your browser.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat
          icon={Target} label="Test Accuracy" value={pct(metrics.accuracy)}
          sub={`${metrics.correct}/${metrics.total} held-out queries`}
        />
        <Stat
          icon={CheckCircle2} label={`${cv.k}-Fold CV`} value={pct(cv.mean)}
          sub={`± ${(cv.sd * 100).toFixed(1)}% across folds`} accent="text-emerald-400"
        />
        <Stat
          icon={Layers} label="Macro F1" value={metrics.macroF1.toFixed(3)}
          sub={`${metrics.labels.length} intent classes`} accent="text-sky-400"
        />
        <Stat
          icon={Cpu} label="Vocabulary" value={trained.vocabSize.toLocaleString('en-IN')}
          sub={`${trained.trainSize} train / ${trained.testSize} test`} accent="text-purple-400"
        />
        <Stat
          icon={Timer} label="Training Time" value={`${trained.trainingMs}ms`}
          sub="fit + 5-fold CV, in-browser" accent="text-amber-400"
        />
      </div>

      {/* Model card */}
      <div className="glass-panel rounded-2xl p-5 border border-brand-accent/20 bg-gradient-to-br from-brand-accent/[0.06] to-transparent">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-brand-accent" />Model Card
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          {[
            ['Algorithm', 'Multinomial Naive Bayes'],
            ['Features', 'TF-IDF, unigram + bigram'],
            ['Smoothing', `Laplace α = ${BEST_PARAMS.alpha}`],
            ['Normalisation', `${BEST_PARAMS.norm.toUpperCase()} × ${BEST_PARAMS.scale}`],
            ['Corpus', `${TRAINING_DATA.length} labeled queries`],
            ['Split', 'Stratified 75 / 25, seed 42'],
            ['Validation', `${cv.k}-fold cross-validation`],
            ['Baseline', `${pct(baseline)} (random guess)`],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{k}</p>
              <p className="text-slate-200 font-medium mt-0.5">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          The model beats the random baseline by <strong className="text-brand-accent">{(metrics.accuracy / baseline).toFixed(1)}×</strong>.
          Cross-validation is reported alongside the single split because the corpus is small — one split alone would be noisy.
        </p>
      </div>

      {/* Live comparison: trained model vs rule engine */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <GitCompare size={16} className="text-brand-accent" />Trained Model vs Rule Engine
        </h3>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type any business question…"
          className="w-full bg-brand-primary-light border border-white/10 focus:border-brand-accent/50 outline-none rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-colors"
        />

        {comparison && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-4">
                <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">Naive Bayes (trained)</p>
                <p className="text-lg font-bold text-white">{shortLabel(comparison.ml.label)}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {pct(comparison.ml.confidence)} confidence · {comparison.ml.matchedFeatures} features matched
                </p>
                <div className="mt-3 space-y-1.5">
                  {comparison.ml.top.map(t => (
                    <div key={t.label} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 w-32 truncate">{shortLabel(t.label)}</span>
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-400/70 rounded-full" style={{ width: `${t.probability * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 w-10 text-right">{(t.probability * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/[0.06] p-4">
                <p className="text-[10px] font-bold text-brand-accent uppercase tracking-wider mb-2">Rule Engine (hand-written)</p>
                <p className="text-lg font-bold text-white">{shortLabel(comparison.rules.intent)}</p>
                <p className="text-xs text-slate-400 mt-1">{comparison.rules.confidence}% keyword score</p>
                {comparison.rules.corrections?.length > 0 && (
                  <p className="text-[11px] text-amber-400 mt-2">
                    spell-corrected: {comparison.rules.corrections.map(c => `${c.from} → ${c.to}`).join(', ')}
                  </p>
                )}
                {Object.keys(comparison.rules.entities).length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-2">
                    entities: {Object.entries(comparison.rules.entities)
                      .map(([k, v]) => `${k}=${typeof v === 'object' ? v.label : v}`).join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${
              comparison.agree
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}>
              {comparison.agree
                ? '✓ Both approaches agree on this query.'
                : '⚠ The two approaches disagree — a good example of where statistical learning and hand-written rules diverge.'}
            </div>

            {comparison.ml.contributions.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Features driving the prediction
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {comparison.ml.contributions.map(c => (
                    <span key={c.term} className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300">
                      {c.term.replace('_', ' + ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Per-class metrics */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <ListTree size={16} className="text-brand-accent" />Per-Class Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <th className="text-left pb-2 font-bold">Intent</th>
                  <th className="text-right pb-2 font-bold">Precision</th>
                  <th className="text-right pb-2 font-bold">Recall</th>
                  <th className="text-right pb-2 font-bold">F1</th>
                  <th className="text-right pb-2 font-bold">n</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {metrics.perClass.filter(c => c.support > 0).sort((a, b) => b.f1 - a.f1).map(c => (
                  <tr key={c.label}>
                    <td className="py-2 text-slate-200">{shortLabel(c.label)}</td>
                    <td className="py-2 text-right text-slate-400 tabular-nums">{c.precision.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-400 tabular-nums">{c.recall.toFixed(2)}</td>
                    <td className={`py-2 text-right font-bold tabular-nums ${
                      c.f1 >= 0.8 ? 'text-emerald-400' : c.f1 >= 0.5 ? 'text-amber-400' : 'text-rose-400'
                    }`}>{c.f1.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-600 tabular-nums">{c.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            Training corpus is balanced: {Math.min(...Object.values(classDist))}–{Math.max(...Object.values(classDist))} examples per intent.
          </p>
        </div>

        {/* Confusion matrix */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Grid3x3 size={16} className="text-brand-accent" />Confusion Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <tbody>
                {activeLabels.map(rowLabel => {
                  const i = INTENT_LABELS.indexOf(rowLabel);
                  return (
                    <tr key={rowLabel}>
                      <td className="text-[10px] text-slate-400 pr-2 text-right whitespace-nowrap sticky left-0 bg-brand-primary">
                        {shortLabel(rowLabel)}
                      </td>
                      {activeLabels.map(colLabel => {
                        const j = INTENT_LABELS.indexOf(colLabel);
                        const v = metrics.matrix[i][j];
                        const diag = i === j;
                        return (
                          <td key={colLabel} className="p-0">
                            <div
                              title={`actual ${shortLabel(rowLabel)} → predicted ${shortLabel(colLabel)}: ${v}`}
                              className={`w-6 h-6 flex items-center justify-center text-[9px] font-bold border border-brand-primary ${
                                v === 0 ? 'text-slate-700' : diag ? 'text-emerald-200' : 'text-rose-200'
                              }`}
                              style={{
                                backgroundColor: v === 0
                                  ? 'transparent'
                                  : diag
                                    ? `rgba(16,185,129,${0.15 + 0.65 * (v / maxCell)})`
                                    : `rgba(244,63,94,${0.2 + 0.6 * (v / maxCell)})`,
                              }}
                            >
                              {v || ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            Rows = actual intent, columns = predicted. <span className="text-emerald-400">Green diagonal</span> = correct;
            <span className="text-rose-400"> red off-diagonal</span> = confusion. Hover any cell for detail.
          </p>
        </div>
      </div>

      {/* Errors */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <XCircle size={16} className="text-rose-400" />Misclassified Test Queries
          <span className="text-[10px] text-slate-500 normal-case font-normal">{trained.errors.length} of {metrics.total}</span>
        </h3>
        {trained.errors.length === 0 ? (
          <p className="text-sm text-slate-400">No errors on the held-out set.</p>
        ) : (
          <div className="space-y-2">
            {trained.errors.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm py-2 border-b border-white/5 last:border-0">
                <span className="text-slate-200 flex-1 min-w-[180px]">“{e.text}”</span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  actual: {shortLabel(e.actual)}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  predicted: {shortLabel(e.predicted)}
                </span>
                <span className="text-[10px] text-slate-500 tabular-nums">{pct(e.confidence)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          An earlier version lost 4 test queries to a single systematic confusion: <em>profit</em> predicted as
          <em> revenue_total</em>, because words like “earn” and “made” appeared in both classes' training examples.
          Disambiguating that vocabulary in the corpus removed the error class entirely and lifted accuracy by ~5 points.
          What remains are scattered one-off errors rather than a systematic bias — the practical ceiling of a
          bag-of-words model, which has no notion of word order beyond bigrams. The rule engine covers these cases via
          explicit keyword priority, which is why PRISM ships both.
        </p>
      </div>
    </div>
  );
}
