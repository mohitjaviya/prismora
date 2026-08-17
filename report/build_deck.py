"""
Builds the PRISM AI internship presentation as a valid .pptx (Office Open XML).

python-pptx is unavailable in this environment (no network access for pip), so
the package is assembled directly: a .pptx is a ZIP archive of XML parts, and
this script emits the minimum set PowerPoint requires — content types, package
and presentation relationships, one slide master, one layout, a theme, and one
part per slide.
"""

import zipfile
from xml.sax.saxutils import escape

OUT = "PRISM_AI_Presentation.pptx"

# 16:9 in English Metric Units (1 inch = 914,400 EMU)
SLIDE_W, SLIDE_H = 12192000, 6858000

ACCENT = "1F6FEB"   # headline blue
DARK = "0D1117"     # near-black body text
MUTED = "57606A"    # secondary text
RULE = "D0D7DE"     # divider grey

# ─────────────────────────────────────────────────────────────────────────────
# Slide content.  Each entry: (title, subtitle, [body lines]).
# A line beginning "* " renders as a bullet; "> " renders as an indented
# sub-point; "# " renders as a bold mini-heading; "" is a spacer.
# ─────────────────────────────────────────────────────────────────────────────
SLIDES = [
    ("PRISM AI",
     "A Hybrid Natural Language Interface for Enterprise Business Intelligence",
     ["", "Artificial Intelligence Internship Project",
      "",
      "# Submitted by",
      "[Your Full Name]  |  Enrolment No. [Enrolment Number]",
      "",
      "# Under the Guidance of",
      "[Faculty Guide Name]  |  [Industry Mentor Name]",
      "",
      "# Organisation",
      "[Company Name]",
      "",
      "Department of Computer Science and Engineering, [University Name]"]),

    ("Contents",
     "",
     ["* Title and Problem Statement",
      "* Organisation Overview and Internship Structure",
      "* Proposed System Overview",
      "* Implementation Details",
      "* Working Demonstration",
      "* Testing and Validation",
      "* Methodology and Algorithms Used",
      "* Tools and Technologies",
      "* Results and Outcomes",
      "* Challenges Faced and Solutions",
      "* Future Scope and Enhancements",
      "* Conclusion"]),

    ("Title and Problem Statement",
     "PRISM AI — natural language querying over live enterprise data",
     ["# THE PROBLEM",
      "Enterprise systems store far more than their users can retrieve. Dashboards answer only "
      "the questions someone anticipated; every other question needs a developer.",
      "Conversational AI solves coverage but introduces three costs: business data must be sent "
      "to a third party, each query costs money and seconds, and a generative model can state a "
      "wrong number with total confidence.",
      "",
      "# PROJECT OBJECTIVE",
      "Build a natural language interface that understands business questions and computes "
      "answers arithmetically from live records — on-device, instant, zero cost, and incapable "
      "of inventing a figure.",
      "",
      "# FOUR PILLARS",
      "* Intent Classification — 17 business intents, weighted concept scoring",
      "* Named Entity Recognition — live gazetteer over products, people, partners, regions",
      "* Fuzzy Matching — Damerau-Levenshtein typo tolerance",
      "* Dialogue State Tracking — follow-up questions inherit prior context"]),

    ("Organisation Overview",
     "Internship context and programme structure",
     ["# ABOUT THE ORGANISATION",
      "[Company Name] — [two to three lines: year established, location, principal business "
      "activity, and domains served. If routed through a training provider, note accreditation.]",
      "",
      "# MY INTERNSHIP",
      "* Role — Artificial Intelligence Intern",
      "* Duration — [N] weeks, [Start Date] to [End Date]",
      "* Mode — [Remote / Hybrid / On-site]",
      "* Deployment — Prismora, a production CRM/ERP platform with live order, invoice, "
      "inventory and channel-partner data",
      "",
      "# PHASE STRUCTURE",
      "* Phase 1 — Domain analysis; catalogue of real operator questions",
      "* Phase 2 — Symbolic NLP pipeline across 17 intents",
      "* Phase 3 — Fuzzy matching and dialogue state tracking",
      "* Phase 4 — Labelled corpus; TF-IDF and Naive Bayes from first principles",
      "* Phase 5 — Cross-validated evaluation and iterative improvement",
      "* Phase 6 — Integration, evaluation dashboard, documentation"]),

    ("Proposed System Overview",
     "A hybrid architecture: symbolic engine for operations, statistical classifier for evaluation",
     ["# WHY HYBRID",
      "Rule systems fail on unseen phrasing but never fail silently. Statistical models "
      "generalise but inherit any inconsistency in their labels. Retaining both gives coverage "
      "plus an auditable fallback — and their disagreements reveal gaps in the rule vocabulary.",
      "",
      "# CAPABILITIES DELIVERED",
      "* Symbolic Engine — 7-stage pipeline: normalise, tokenise, stem, expand, classify, "
      "extract entities, track dialogue state",
      "* Statistical Classifier — TF-IDF over unigrams and bigrams feeding Multinomial Naive "
      "Bayes, implemented from scratch with no ML library",
      "* Typo Tolerance — Damerau-Levenshtein with an asymmetric edit budget",
      "* Conversation Memory — continuation markers, referential expressions, entity merging",
      "* Predictive Analytics — demand projection, depletion forecasting, disengagement scoring "
      "(statistical heuristics, explicitly not machine learning)",
      "* Evaluation Dashboard — live in-app metrics, confusion matrix, error listing",
      "",
      "# KEY CONSTRAINT SATISFIED",
      "No business data leaves the client. Numbers are computed, never generated."]),

    ("Implementation Details",
     "Seven processing stages from raw text to a computed answer",
     ["# STAGE 1 — NORMALISATION",
      "Lowercase and strip punctuation, preserving currency, percent, decimal and hyphen",
      "",
      "# STAGE 2 — TOKENISATION AND STOP-WORDS",
      "Interrogatives (how, which, who) deliberately retained — strongest count-vs-value signal",
      "",
      "# STAGE 3 — STEMMING",
      "Suffix stripping collapses invoices / invoicing / invoiced to a shared root",
      "",
      "# STAGE 4 — CONCEPT EXPANSION",
      "23 synonym groups map turnover / sales / topline / billing onto one concept",
      "",
      "# STAGE 5 — INTENT CLASSIFICATION",
      "Required, supporting and negative concepts per intent; declines below a confidence floor",
      "",
      "# STAGE 6 — ENTITY RECOGNITION",
      "Gazetteer built from live tables — new products are recognised the moment they are saved",
      "",
      "# STAGE 7 — DIALOGUE STATE",
      "Prior intent and entities retained; new values override, unmentioned ones persist"]),

    ("Working Demonstration",
     "Behaviour observed in the running application",
     ["# TYPO TOLERANCE",
      "\"which distribtors are at churn risk\"  ->  full churn report  [distribtor -> distributor]",
      "\"show unpiad invoces\"  ->  outstanding receivables  [2 corrections applied]",
      "",
      "# CONVERSATION MEMORY",
      "User: revenue by state    ->  Gujarat Rs 95,000 (76%) | Maharashtra Rs 30,000 (24%)",
      "User: what about Gujarat? ->  Gujarat detail        [continuation marker: intent inherited]",
      "User: and last 30 days?   ->  Gujarat, 30 days      [state retained, timeframe added]",
      "",
      "# TRANSPARENCY",
      "Every answer carries its resolved intent, the entities extracted, any spelling corrections "
      "applied, and a follow-up indicator — so the user can judge whether the question they "
      "asked is the question that was answered.",
      "",
      "# EVALUATION DASHBOARD",
      "The ML Lab route trains the classifier in-browser on load and displays headline metrics, "
      "the per-class table, the confusion matrix, and every misclassified test query. A live "
      "comparison box shows the trained model and the rule engine side by side on any input."]),

    ("Testing and Validation",
     "Evaluation methodology and the discipline behind the reported figures",
     ["# FOUR METHODOLOGICAL PRINCIPLES",
      "* Stratified splitting — 75:25 with class proportions preserved, so every intent appears "
      "in both partitions",
      "* Determinism — all shuffling from a seeded generator; every figure reproducible",
      "* Cross-validation — 5-fold reported alongside the single split, and treated as the "
      "honest estimate",
      "* Per-class reporting — precision, recall and F1 per intent, plus the confusion matrix",
      "",
      "# WHY PER-CLASS REPORTING MATTERED",
      "The defect that cost the most accuracy was invisible in the aggregate number. It appeared "
      "only in the confusion matrix, where one ordered pair accounted for 14% of all errors. "
      "Per-class reporting was not presentation — it was the instrument that located the fault.",
      "",
      "# VALIDATION BEYOND THE TEST SET",
      "Ten queries absent from the corpus entirely were used as a held-back sanity check. "
      "All ten were classified correctly, with confidence spanning 64% to 100%."]),

    ("Methodology and Algorithms",
     "From symbolic scoring to trained statistical classification",
     ["# WEIGHTED INTENT SCORING (SYMBOLIC)",
      "Each intent defines required, supporting and negative concepts. Presence accumulates "
      "weight; a negative concept disqualifies outright. Below a floor, the system declines.",
      "",
      "# DAMERAU-LEVENSHTEIN EDIT DISTANCE",
      "Chosen over plain Levenshtein because it charges one edit for an adjacent transposition, "
      "not two: unpiad -> unpaid is distance 1 here, distance 2 otherwise. Since a tight budget "
      "is needed to suppress false positives, that single unit decides whether the most common "
      "real typo is corrected at all. Early row termination bounds the cost.",
      "",
      "# TF-IDF FEATURE EXTRACTION",
      "Smoothed IDF:  idf(t) = ln[(1+n)/(1+df(t))] + 1,  vectors L2-normalised.",
      "Unigrams plus bigrams — short queries turn on word pairs (how many vs how much).",
      "",
      "# MULTINOMIAL NAIVE BAYES",
      "Lidstone smoothing, alpha = 0.3. Smoothing is mandatory, not optional: an unsmoothed "
      "zero probability collapses the entire log-space posterior to negative infinity.",
      "Posterior via softmax with max-subtraction for numerical stability."]),

    ("Tools and Technologies",
     "The stack behind the engine, the classifier and the dashboard",
     ["# LANGUAGE AND RUNTIME",
      "JavaScript (ES2022) — the entire NLP and ML stack executes client-side in the browser",
      "",
      "# NLP — IMPLEMENTED FROM SCRATCH",
      "Normalisation, tokenisation, suffix stemming, synonym-concept expansion, weighted intent "
      "classification, gazetteer NER, Damerau-Levenshtein matching, dialogue state tracking",
      "",
      "# MACHINE LEARNING — IMPLEMENTED FROM SCRATCH",
      "TF-IDF vectoriser, Multinomial Naive Bayes, Complement Naive Bayes, stratified splitting, "
      "k-fold cross-validation, precision / recall / F1, confusion matrix",
      "",
      "# APPLICATION LAYER",
      "React 18, Vite, Tailwind CSS, Supabase (PostgreSQL), Recharts",
      "",
      "# NOTE ON DEPENDENCIES",
      "No ML library is used anywhere in this project. There is no scikit-learn, no TensorFlow, "
      "no NLP toolkit. Every algorithm above was written from its mathematical definition, so "
      "that each step could be examined rather than merely invoked."]),

    ("Results and Outcomes",
     "Measured performance of the trained classifier",
     ["# HEADLINE METRICS",
      "* Test-set accuracy — 85.8%  (145 of 169 held-out queries)",
      "* Five-fold cross-validated accuracy — 78.7% +/- 2.7%",
      "* Macro-averaged F1 — 0.859",
      "* Random baseline — 5.9%  (model is approximately 13.3x better)",
      "* Corpus — 659 labelled queries across 17 intents",
      "* Vocabulary — 476 unigram and bigram features",
      "* Training time — approximately 48 ms, in-browser",
      "",
      "# FOLD SCORES",
      "81.0%   75.7%   80.3%   81.4%   75.2%      mean 78.7%,  std dev 2.7%",
      "",
      "# STRONGEST CLASSES (F1)",
      "profit 0.96  |  dead_stock 0.95  |  lead_summary 0.95  |  expense_breakdown 0.94",
      "",
      "# WEAKEST CLASSES (F1)",
      "order_summary 0.73  |  revenue_by_state 0.74  |  revenue_total 0.75",
      "",
      "The cross-validated figure is treated as authoritative. The single split exceeded it by "
      "7.1 points, which quantifies how far one partition can flatter a model at this scale."]),

    ("Challenges Faced and Solutions",
     "Diagnosis preceded every change",
     ["# 1 — NEAR-UNIFORM POSTERIORS",
      "Softmax reported roughly 10% across all 17 classes. Traced to L2 normalisation "
      "compressing the log-score range. A scaling factor sharpened the posterior without "
      "altering which class wins.",
      "",
      "# 2 — FUZZY MATCHING CORRUPTED VALID WORDS",
      "\"doing\" -> \"owing\" and \"trader\" -> \"order\". Edit budget for short tokens cut to a "
      "single edit, plus a protected list so correctly spelled common words are never corrected.",
      "",
      "# 3 — SUBSTRING COLLISION",
      "\"total spending\" matched the order status \"pending\". Replaced substring testing with "
      "whole-word boundary matching for short controlled vocabularies.",
      "",
      "# 4 — ONE CONFUSION PAIR CAUSED 14% OF ALL ERRORS",
      "profit predicted as revenue_total. Root cause was ambiguous labelling in my own corpus: "
      "earn, money and make appeared under both labels. Restructuring the lexical territory of "
      "the two classes eliminated the error class entirely.",
      "",
      "# 5 — OVERCONFIDENT OUTPUT",
      "The highest-scoring configuration reported 100% confidence on every query. A lower scale "
      "was chosen: accuracy statistically unchanged, but confidence spanning a usable 64-100%. "
      "A displayed number must mean something."]),

    ("A Negative Result Worth Reporting",
     "Complement Naive Bayes — the experiment that did not work",
     ["# THE HYPOTHESIS",
      "Error analysis identified overlapping class vocabulary as the dominant failure mode. "
      "Complement Naive Bayes (Rennie et al., 2003) is formulated for precisely this condition: "
      "it estimates each class from the complement of that class rather than from its own "
      "documents, and normalises weights so large vocabularies cannot dominate.",
      "",
      "# THE MEASUREMENT",
      "Implemented in full alongside sublinear TF scaling, then evaluated across 80 "
      "configurations under identical five-fold cross-validation.",
      "* Multinomial Naive Bayes — 75.3% best CV accuracy, 95% mean confidence",
      "* Complement Naive Bayes — 75.7% best CV accuracy, 6% mean confidence",
      "",
      "# THE OUTCOME",
      "An improvement of 0.4 points, well inside the 2.7-point fold standard deviation and "
      "indistinguishable from noise. Weight normalisation additionally collapsed reported "
      "confidence to roughly 6% — a correct argmax, but useless as a displayed value.",
      "",
      "# WHY IT IS REPORTED",
      "The hypothesis was that the algorithm was deficient. The measurement refuted that, and "
      "redirected effort to the training data where the defect actually lay. Adopting CNB on "
      "theoretical merit without measuring would have left the labelling fault undetected."]),

    ("Future Scope and Enhancements",
     "Identified limitations and the next iterations they imply",
     ["# ACKNOWLEDGED LIMITATIONS",
      "* Representational ceiling — bag-of-words with bigrams encodes no longer-range word order",
      "* Residual overfitting — 98.8% training against 78.7% cross-validated accuracy",
      "* Corpus provenance — authored by one person, so it reflects expected rather than "
      "observed phrasing",
      "* Bounded competence — 17 intents; no open-ended or multi-step reasoning",
      "",
      "# PLANNED WORK",
      "* Collect real query logs — replace assumed phrasing with an observed distribution; the "
      "single highest-value next step",
      "* Sentence embeddings — a quantised sentence-transformer would break the bag-of-words "
      "ceiling by matching queries that share meaning but no vocabulary",
      "* Confidence calibration — Platt scaling or isotonic regression to align displayed "
      "confidence with observed correctness, enabling a principled abstention threshold",
      "* Unsupervised learning — k-means over RFM features for data-driven customer segmentation",
      "* Extend coverage — procurement, schemes, claims, complaints, field-force attendance",
      "* Put the classifier in the operational path — classifier for intent, symbolic engine for "
      "entities and dialogue state"]),

    ("Conclusion",
     "What was built, what was measured, and what it taught",
     ["# WHAT WAS BUILT",
      "A working natural language interface to a production enterprise system, implementing the "
      "three canonical components of a task-oriented dialogue system — intent classification, "
      "named entity recognition and dialogue state tracking — alongside a statistical classifier "
      "written from mathematical first principles with no ML library.",
      "",
      "# WHAT WAS MEASURED",
      "85.8% held-out accuracy and 78.7% +/- 2.7% under five-fold cross-validation across 17 "
      "intents, approximately 13.3 times the random baseline. No business data leaves the "
      "client; answers are computed, never generated.",
      "",
      "# WHAT IT TAUGHT",
      "The progression from 47.1% to 78.7% came from diagnosis, not from trying algorithms until "
      "one worked. Overfitting was identified from the train-test divergence. Flat posteriors "
      "were traced to normalisation. The dominant confusion was root-caused to my own labelling.",
      "The largest gain came from corpus work (+24.1 points across two iterations). The change "
      "made on the strongest theoretical grounds delivered 0.4 points and was kept as a "
      "documented negative result.",
      "",
      "Measure before changing; keep the result when it contradicts the expectation."]),
]


# ─────────────────────────────────────────────────────────────────────────────
# OOXML part builders
# ─────────────────────────────────────────────────────────────────────────────
def text_run(txt, size, bold=False, color=DARK, italic=False):
    return (
        f'<a:r><a:rPr lang="en-IN" sz="{size}" b="{1 if bold else 0}" '
        f'i="{1 if italic else 0}" dirty="0">'
        f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
        f'<a:latin typeface="Calibri"/></a:rPr>'
        f'<a:t>{escape(txt)}</a:t></a:r>'
    )


def body_paragraph(line):
    """Render one content line according to its prefix marker."""
    if line == "":
        return '<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr></a:p>'

    if line.startswith("# "):
        return (
            '<a:p><a:pPr marL="0" indent="0"><a:buNone/>'
            '<a:spcBef><a:spcPts val="500"/></a:spcBef></a:pPr>'
            + text_run(line[2:], 1250, bold=True, color=ACCENT) + '</a:p>'
        )

    if line.startswith("* "):
        return (
            '<a:p><a:pPr marL="285750" indent="-285750">'
            '<a:spcBef><a:spcPts val="240"/></a:spcBef>'
            f'<a:buClr><a:srgbClr val="{ACCENT}"/></a:buClr>'
            '<a:buChar char="•"/></a:pPr>'
            + text_run(line[2:], 1200) + '</a:p>'
        )

    if line.startswith("> "):
        return (
            '<a:p><a:pPr marL="571500" indent="-228600">'
            f'<a:buClr><a:srgbClr val="{MUTED}"/></a:buClr>'
            '<a:buChar char="–"/></a:pPr>'
            + text_run(line[2:], 1100, color=MUTED) + '</a:p>'
        )

    return (
        '<a:p><a:pPr marL="0" indent="0"><a:buNone/>'
        '<a:spcBef><a:spcPts val="240"/></a:spcBef></a:pPr>'
        + text_run(line, 1200) + '</a:p>'
    )


def shape(idx, name, x, y, cx, cy, paragraphs, anchor="t"):
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{idx}" name="{name}"/>'
        f'<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
        f'<p:txBody><a:bodyPr wrap="square" anchor="{anchor}"><a:normAutofit/></a:bodyPr>'
        f'<a:lstStyle/>{paragraphs}</p:txBody></p:sp>'
    )


def rect(idx, x, y, cx, cy, color):
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{idx}" name="Rule {idx}"/>'
        f'<p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln/></p:spPr>'
        f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>'
    )


def build_slide(n, title, subtitle, lines):
    shapes = []
    is_title_slide = (n == 1)

    if is_title_slide:
        shapes.append(rect(2, 0, 0, SLIDE_W, 118000, ACCENT))
        shapes.append(shape(
            3, "Title", 914400, 1200000, SLIDE_W - 1828800, 900000,
            '<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>'
            + text_run(title, 5400, bold=True, color=ACCENT) + '</a:p>'))
        shapes.append(shape(
            4, "Subtitle", 914400, 2150000, SLIDE_W - 1828800, 700000,
            '<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>'
            + text_run(subtitle, 1600, color=MUTED, italic=True) + '</a:p>'))
        body = "".join(
            '<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>'
            + (text_run(l[2:], 1250, bold=True, color=ACCENT) if l.startswith("# ")
               else text_run(l, 1300))
            + '</a:p>' if l else '<a:p><a:pPr><a:buNone/></a:pPr></a:p>'
            for l in lines)
        shapes.append(shape(5, "Body", 914400, 2900000, SLIDE_W - 1828800, 3400000, body))
    else:
        shapes.append(rect(2, 685800, 640000, 260000, 62000, ACCENT))
        shapes.append(shape(
            3, "Title", 685800, 300000, SLIDE_W - 1371600, 560000,
            '<a:p><a:pPr><a:buNone/></a:pPr>'
            + text_run(title, 2800, bold=True, color=ACCENT) + '</a:p>'))
        top = 760000
        if subtitle:
            shapes.append(shape(
                4, "Subtitle", 685800, 745000, SLIDE_W - 1371600, 340000,
                '<a:p><a:pPr><a:buNone/></a:pPr>'
                + text_run(subtitle, 1250, color=MUTED, italic=True) + '</a:p>'))
            top = 1120000
        shapes.append(shape(
            5, "Body", 685800, top, SLIDE_W - 1371600, SLIDE_H - top - 460000,
            "".join(body_paragraph(l) for l in lines)))

        shapes.append(shape(
            6, "PageNo", SLIDE_W - 1200000, SLIDE_H - 420000, 700000, 260000,
            '<a:p><a:pPr algn="r"><a:buNone/></a:pPr>'
            + text_run(str(n), 1000, color=MUTED) + '</a:p>'))

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'
        '<a:effectLst/></p:bgPr></p:bg>'
        '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        + "".join(shapes) +
        '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" '
        'bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
        'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" '
        'folHlink="folHlink"/></p:clrMapOvr></p:sld>'
    )


N = len(SLIDES)

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
    + "".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" '
        f'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, N + 1))
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    '</Types>'
)

ROOT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
    '</Relationships>'
)

PRESENTATION = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">'
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    '<p:sldIdLst>'
    + "".join(f'<p:sldId id="{255 + i}" r:id="rId{i + 1}"/>' for i in range(1, N + 1))
    + '</p:sldIdLst>'
    f'<p:sldSz cx="{SLIDE_W}" cy="{SLIDE_H}"/>'
    '<p:notesSz cx="6858000" cy="9144000"/>'
    '</p:presentation>'
)

PRESENTATION_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
    + "".join(
        f'<Relationship Id="rId{i + 1}" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" '
        f'Target="slides/slide{i}.xml"/>'
        for i in range(1, N + 1))
    + f'<Relationship Id="rId{N + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'
    '</Relationships>'
)

EMPTY_TREE = (
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/>'
    '</p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>'
)

CLR_MAP = ('<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" '
           'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" '
           'accent6="accent6" hlink="hlink" folHlink="folHlink"/>')

SLIDE_MASTER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    + EMPTY_TREE + CLR_MAP +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
    '</p:sldMaster>'
)

SLIDE_MASTER_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
    '</Relationships>'
)

SLIDE_LAYOUT = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">'
    + EMPTY_TREE + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
)

SLIDE_LAYOUT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
    '</Relationships>'
)


def dk_lt_scheme():
    accents = [ACCENT, "2DA44E", "BC4C00", "8250DF", "0969DA", "CF222E"]
    s = ('<a:clrScheme name="PRISM">'
         '<a:dk1><a:srgbClr val="0D1117"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>'
         '<a:dk2><a:srgbClr val="57606A"/></a:dk2><a:lt2><a:srgbClr val="F6F8FA"/></a:lt2>')
    for i, c in enumerate(accents, start=1):
        s += f'<a:accent{i}><a:srgbClr val="{c}"/></a:accent{i}>'
    s += ('<a:hlink><a:srgbClr val="0969DA"/></a:hlink>'
          '<a:folHlink><a:srgbClr val="8250DF"/></a:folHlink></a:clrScheme>')
    return s


FILL_STYLES = (
    '<a:fillStyleLst>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '</a:fillStyleLst>'
    '<a:lnStyleLst>'
    '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    '</a:lnStyleLst>'
    '<a:effectStyleLst>'
    '<a:effectStyle><a:effectLst/></a:effectStyle>'
    '<a:effectStyle><a:effectLst/></a:effectStyle>'
    '<a:effectStyle><a:effectLst/></a:effectStyle>'
    '</a:effectStyleLst>'
    '<a:bgFillStyleLst>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '</a:bgFillStyleLst>'
)

THEME = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PRISM">'
    '<a:themeElements>'
    + dk_lt_scheme() +
    '<a:fontScheme name="PRISM">'
    '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>'
    '</a:fontScheme>'
    '<a:fmtScheme name="PRISM">' + FILL_STYLES + '</a:fmtScheme>'
    '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
)

CORE = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    '<dc:title>PRISM AI - Artificial Intelligence Internship Project</dc:title>'
    '<dc:subject>Hybrid Natural Language Interface for Enterprise Business Intelligence</dc:subject>'
    '<cp:revision>1</cp:revision></cp:coreProperties>'
)

APP = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    f'<Slides>{N}</Slides><Application>Microsoft Office PowerPoint</Application>'
    '</Properties>'
)


def main():
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", ROOT_RELS)
        z.writestr("docProps/core.xml", CORE)
        z.writestr("docProps/app.xml", APP)
        z.writestr("ppt/presentation.xml", PRESENTATION)
        z.writestr("ppt/_rels/presentation.xml.rels", PRESENTATION_RELS)
        z.writestr("ppt/slideMasters/slideMaster1.xml", SLIDE_MASTER)
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", SLIDE_MASTER_RELS)
        z.writestr("ppt/slideLayouts/slideLayout1.xml", SLIDE_LAYOUT)
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", SLIDE_LAYOUT_RELS)
        z.writestr("ppt/theme/theme1.xml", THEME)

        for i, (title, subtitle, lines) in enumerate(SLIDES, start=1):
            z.writestr(f"ppt/slides/slide{i}.xml", build_slide(i, title, subtitle, lines))
            z.writestr(
                f"ppt/slides/_rels/slide{i}.xml.rels",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" '
                'Target="../slideLayouts/slideLayout1.xml"/></Relationships>')

    print(f"Wrote {OUT} with {N} slides")


if __name__ == "__main__":
    main()
