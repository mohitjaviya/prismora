"""Builds the full-platform Prismora presentation."""

from pptx_builder import build

SLIDES = [
    ("Prismora",
     "An Integrated Distribution Management, CRM and ERP Platform with an "
     "Embedded Natural Language Intelligence Layer",
     ["", "Artificial Intelligence / Software Engineering Internship Project",
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
     ["* Problem Statement and Objectives",
      "* Organisation Overview and Internship Structure",
      "* System Architecture",
      "* Database and Access Control Design",
      "* Module Implementation — Order to Cash, Inventory, Channel, Accounting",
      "* Module Implementation — Procurement, Schemes, Field Force",
      "* The PRISM AI Intelligence Layer",
      "* Machine Learning — Methodology and Results",
      "* Testing and Validation",
      "* Results and Outcomes",
      "* Challenges Faced and Solutions",
      "* Future Scope and Conclusion"]),

    ("Problem Statement",
     "Why an integrated platform, and why a self-built intelligence layer",
     ["# THE PROBLEM",
      "Distribution businesses reconcile purchases against receipts, receipts against stock, "
      "stock against commitments, and invoices against collections. When each record lives in a "
      "different tool — or in none — reconciliation becomes manual and error-prone, and its "
      "failures surface as disputed claims, expired stock and uncollected receivables.",
      "The organisation operates a three-tier channel — company to distributor, distributor to "
      "dealer, dealer to retailer — each tier with its own credit terms, pricing and incentive "
      "schemes. Modest transaction volume, high relational complexity: exactly the profile "
      "spreadsheet-based operation handles worst.",
      "",
      "# TWO-PART OBJECTIVE",
      "* Platform — a single authoritative record across the order-to-cash and procure-to-pay "
      "cycles, batch inventory, accounting, channel management and field-force automation",
      "* Intelligence layer — natural language querying over that data, computing answers "
      "arithmetically rather than generating them, with no business data leaving the client"]),

    ("Organisation Overview",
     "Internship context and programme structure",
     ["# ABOUT THE ORGANISATION",
      "[Company Name] — [two to three lines: year established, location, principal business "
      "activity, domains served. If routed through a training provider, note accreditation.]",
      "",
      "# MY INTERNSHIP",
      "* Role — [Artificial Intelligence / Software Engineering] Intern",
      "* Duration — [N] weeks, [Start Date] to [End Date]",
      "* Mode — [Remote / Hybrid / On-site]",
      "* Deployment — production use by a personal-care products distributor",
      "",
      "# PHASE STRUCTURE",
      "* Phase 1 — Requirement analysis; process mapping; entity model",
      "* Phase 2 — Core platform: auth, RBAC, leads, order-to-cash, inventory",
      "* Phase 3 — Channel and financial modules; procurement; schemes; field force",
      "* Phase 4 — Symbolic NLP engine across 17 intents",
      "* Phase 5 — Statistical classifier; cross-validated evaluation",
      "* Phase 6 — Integration, evaluation dashboard, documentation"]),

    ("System Architecture",
     "A three-tier design with instant-load, offline-tolerant persistence",
     ["# WHY THIS SHAPE",
      "Business logic is concentrated in a single state-management layer rather than spread "
      "across screens, so an operation like order confirmation applies stock deduction, invoice "
      "generation, incentive evaluation and audit logging identically no matter which screen "
      "triggered it.",
      "",
      "# THREE TIERS",
      "* Presentation — 34 screens, role-branching, permission-guarded routes",
      "* Logic — React Context providers owning every mutation; domain services for NLP and ML",
      "* Data — PostgreSQL, 30 tables, mirrored to local storage for instant first paint and "
      "offline reads",
      "",
      "# PERSISTENCE STRATEGY",
      "Every write goes to PostgreSQL and mirrors to local storage. The interface renders from "
      "cache immediately while the authoritative fetch runs in the background; the server "
      "remains authoritative, so a conflict resolves in its favour.",
      "",
      "# STACK",
      "React 18, Vite, Tailwind CSS, Recharts — Supabase / PostgreSQL — vanilla JavaScript for "
      "the entire NLP and ML layer, no external library"]),

    ("Database and Access Control",
     "Thirty tables, fifteen roles, twenty-one permission domains",
     ["# SCHEMA — NINE OPERATIONAL GROUPS",
      "Identity & config · Customer relationship · Channel hierarchy · Order to cash · "
      "Inventory · Procure to pay · Financial · Trade schemes · Field force",
      "",
      "# ACCESS CONTROL MODEL",
      "Fifteen roles (internal staff and external channel partners) against twenty-one "
      "permission domains, each cell one of four levels:",
      "* full — read and write across all records",
      "* view — read across all records, no mutation",
      "* own — confined to records the user owns or is assigned",
      "* none — domain unreachable",
      "",
      "# WHY \"own\" MATTERS",
      "It is what makes one deployment safe for external partners. A distributor querying "
      "orders receives only records bearing their identifier — enforced in the data layer, not "
      "per screen, so no screen author can omit it.",
      "",
      "# VERIFIED PROGRAMMATICALLY",
      "Scripted enumeration confirmed every role carries an explicit entry for all 21 domains — "
      "zero gaps, since an absent entry would default to a permissive interpretation."]),

    ("Module Implementation I",
     "Order to cash, inventory, and channel management",
     ["# ORDER TO CASH",
      "Seven-state fulfilment hierarchy with stage ownership — Pending, Processing, Ready for "
      "Dispatch, Shipped, Partially Delivered, Delivered, Cancelled — each stage owned by a "
      "specific role group, so sales cannot mark goods dispatched.",
      "Stock availability validated at every forward transition; partial delivery records a "
      "cumulative delivered quantity when only part of an order can be fulfilled.",
      "",
      "# BATCH INVENTORY",
      "Personal-care products carry expiry dates, so stock is held per batch with manufacture "
      "and expiry dates. Allocation follows first-expiry-first-out. Multi-warehouse transfer and "
      "cycle counting with variance capture are supported.",
      "",
      "# THREE-TIER CHANNEL MANAGEMENT",
      "Distributors, dealers and retailers share one code path via an identifier-field mapping "
      "rather than three branches, eliminating a defect class where a fix applied to two tiers "
      "was omitted from the third. Each tier has self-registration and an authenticated portal."]),

    ("Module Implementation II",
     "Accounting, procurement, schemes, and field force",
     ["# ACCOUNTING",
      "Invoice generation from orders, payment recording, credit notes, expense capture by "
      "category, receivables and payables ageing.",
      "",
      "# PROCURE TO PAY",
      "Purchase orders age visibly while awaiting receipt. Goods receipt admits stock into a "
      "batch and simultaneously raises the vendor payable, so stock and liability cannot "
      "diverge. Returns reverse both; vendor payments post against a running ledger.",
      "",
      "# SCHEMES AND CLAIMS",
      "Trade schemes carry product applicability, a validity window and a benefit basis. "
      "Eligibility is evaluated automatically at order confirmation — not claimed "
      "retrospectively, which is where most disputes originate.",
      "",
      "# FIELD-FORCE AUTOMATION",
      "Territories and beat plans define expected coverage; attendance and visit reports record "
      "actual activity. A visit resulting in an order links the two, so field activity and "
      "commercial outcome are traceable to each other."]),

    ("The PRISM AI Intelligence Layer",
     "Natural language querying over live operational data",
     ["# DESIGN POSITION",
      "PRISM AI executes entirely on the client. The system parses a question, determines "
      "intent and entities, and computes the answer arithmetically from live records — numbers "
      "are never generated, only calculated.",
      "",
      "# WHY NOT A HOSTED LANGUAGE MODEL",
      "An earlier version sent business records to a hosted model as prompt context. Four "
      "objections: data left the client, every query cost money and 1-3 seconds, availability "
      "depended on network and provider uptime, and the model occasionally stated a wrong "
      "number with full confidence — tolerable for drafting, not for a system of record.",
      "",
      "# SEVEN-STAGE PIPELINE",
      "* Normalise — lowercase, strip punctuation, preserve currency / percent / decimal",
      "* Tokenise & remove stop-words — interrogatives deliberately kept",
      "* Stem — collapse invoices / invoicing / invoiced to one root",
      "* Expand — 23 synonym groups map surface forms to one concept",
      "* Classify intent — weighted scoring across 17 business intents",
      "* Extract entities — live gazetteer over products, people, partners, regions",
      "* Track dialogue state — follow-up questions inherit prior context"]),

    ("PRISM AI — Robustness Features",
     "Typo tolerance and conversation memory, demonstrated live",
     ["# TYPO TOLERANCE — DAMERAU-LEVENSHTEIN",
      "Charges one edit for an adjacent transposition, not two — unpiad to unpaid is distance 1, "
      "not 2. Since a tight budget is needed to suppress false positives, that single unit "
      "decides whether the commonest real typo is corrected at all.",
      "\"which distribtors are at churn risk\"  ->  full churn report",
      "\"show unpiad invoces\"  ->  outstanding receivables report",
      "",
      "# CONVERSATION MEMORY",
      "User: revenue by state    ->  Gujarat Rs 95,000 (76%) | Maharashtra Rs 30,000 (24%)",
      "User: what about Gujarat? ->  Gujarat detail        [intent inherited]",
      "User: and last 30 days?   ->  Gujarat, 30 days      [state kept, timeframe added]",
      "",
      "# TRANSPARENCY",
      "Every answer carries its resolved intent, extracted entities, any spelling corrections "
      "applied, and a follow-up indicator — so the user can judge whether the question they "
      "asked is the one that was answered."]),

    ("Machine Learning — Methodology",
     "TF-IDF and Naive Bayes, implemented from mathematical first principles",
     ["# NO ML LIBRARY USED",
      "No scikit-learn, no TensorFlow. Every formula below was written from its mathematical "
      "definition so each step could be examined rather than merely invoked.",
      "",
      "# CORPUS",
      "659 hand-labelled queries across 17 intents, 30-55 examples per class, varied in length, "
      "register, word order and vocabulary — including Indian-English business terms (godown, "
      "party, offtake) reflecting how users actually speak.",
      "",
      "# TF-IDF FEATURES",
      "Unigrams plus bigrams — short queries hinge on word pairs (how many vs how much). "
      "Smoothed IDF: idf(t) = ln[(1+n)/(1+df(t))] + 1, vectors L2-normalised.",
      "",
      "# MULTINOMIAL NAIVE BAYES",
      "Lidstone smoothing, alpha = 0.3 — mandatory, since an unsmoothed zero probability "
      "collapses the log-space posterior to negative infinity. Softmax with max-subtraction for "
      "numerical stability.",
      "",
      "# EVALUATION DISCIPLINE",
      "Stratified 75:25 split, seeded determinism, 5-fold cross-validation, per-class "
      "precision/recall/F1, full confusion matrix"]),

    ("Machine Learning — Results",
     "85.8% held-out accuracy, 78.7% cross-validated",
     ["# HEADLINE METRICS",
      "* Test-set accuracy — 85.8%  (145 of 169 held-out queries)",
      "* Five-fold cross-validated accuracy — 78.7% +/- 2.7%",
      "* Macro-averaged F1 — 0.859",
      "* Random baseline — 5.9%  (model is approximately 13.3x better)",
      "* Corpus — 659 labelled queries, 476 unigram/bigram features",
      "* Training time — approximately 48 ms, in-browser",
      "",
      "# FOLD SCORES",
      "81.0%   75.7%   80.3%   81.4%   75.2%      mean 78.7%, std dev 2.7%",
      "",
      "# STRONGEST CLASSES (F1)",
      "profit 0.96  |  dead_stock 0.95  |  lead_summary 0.95  |  expense_breakdown 0.94",
      "",
      "The cross-validated figure is authoritative. The single split exceeded it by 7.1 points "
      "— quantifying how far one partition can flatter a model at this corpus size."]),

    ("An Iterative Improvement Process",
     "Each gain followed a diagnosis, not a guess",
     ["# ITERATION 1 — BASELINE",
      "244 examples, default hyperparameters  ->  47.1% CV accuracy",
      "93.4% train vs 45.9% test indicated substantial overfitting",
      "",
      "# ITERATION 2 — HYPERPARAMETER SEARCH",
      "180-configuration grid search  ->  54.6% CV accuracy  (+7.5)",
      "L2-normalised vectors summed to ~1, leaving log-scores too close; softmax was near-"
      "uniform at roughly 10% across all 17 classes",
      "",
      "# ITERATION 3 — CORPUS EXPANSION",
      "244 to 616 examples  ->  75.8% CV accuracy  (+21.2, the largest single gain)",
      "~11 examples per class was insufficient to estimate reliable likelihoods",
      "",
      "# ITERATION 4 — LABEL DISAMBIGUATION",
      "Fixed one confusion pair causing 14% of errors  ->  78.7% CV accuracy  (+2.9)",
      "Root cause was inconsistent labelling in my own corpus, not model capacity"]),

    ("A Negative Result Worth Reporting",
     "Complement Naive Bayes — the experiment that did not work",
     ["# THE HYPOTHESIS",
      "Error analysis identified overlapping class vocabulary as the dominant failure mode. "
      "Complement Naive Bayes (Rennie et al., 2003) is formulated for precisely this condition: "
      "it estimates each class from the complement of that class, with weight normalisation so "
      "large vocabularies cannot dominate.",
      "",
      "# THE MEASUREMENT",
      "Implemented in full with sublinear TF scaling, evaluated across 80 configurations under "
      "identical five-fold cross-validation.",
      "* Multinomial Naive Bayes — 75.3% best CV accuracy, 95% mean confidence",
      "* Complement Naive Bayes — 75.7% best CV accuracy, 6% mean confidence",
      "",
      "# THE OUTCOME",
      "0.4 points of improvement, inside the 2.7-point fold standard deviation — "
      "indistinguishable from noise. Weight normalisation also collapsed confidence to ~6%.",
      "",
      "# WHY IT IS REPORTED",
      "The hypothesis was that the algorithm was deficient. The measurement refuted that and "
      "redirected effort to the training data, where the real defect lay."]),

    ("Testing and Validation",
     "How correctness was established across the platform",
     ["# VERIFICATION METHODS",
      "* Whole-application production build compiling all modules; static analysis on every "
      "changed file",
      "* Scripted enumeration of the role-permission matrix — 15 roles x 21 domains, zero gaps",
      "* ML classifier — stratified test set, 5-fold CV, confusion matrix, error listing",
      "* NLP engine — scripted assertions over intent resolution, entity extraction, typo "
      "correction, multi-turn dialogue",
      "* Manual scenario testing — stock shortfall, partial delivery, split orders, expiry-"
      "ordered allocation",
      "* Channel portals — verified per role that no partner observes another's records under "
      "any navigation path",
      "",
      "# WHY PER-CLASS REPORTING MATTERED",
      "The defect costing the most accuracy was invisible in the aggregate number. It appeared "
      "only in the confusion matrix, where one pair caused 14% of all errors.",
      "",
      "# HELD-BACK SANITY CHECK",
      "Ten queries absent from the corpus entirely — all ten classified correctly, confidence "
      "spanning 64% to 100%"]),

    ("Results and Outcomes",
     "What was built, measured end to end",
     ["# PLATFORM SCALE",
      "* 54 source modules, 20,126 lines of code",
      "* 34 application screens across ten functional modules",
      "* 30-table relational schema spanning nine operational cycles",
      "* 15 roles across 21 permission domains, verified complete",
      "",
      "# INTELLIGENCE LAYER SCALE",
      "* 17 natural language intents with entity extraction and multi-turn dialogue",
      "* 659-query labelled training corpus",
      "* 78.7% +/- 2.7% cross-validated classification accuracy",
      "",
      "# PERFORMANCE",
      "Perceived page-load time reduced from 5-6 seconds to effectively instantaneous by "
      "hydrating state synchronously from a local cache before the authoritative network fetch "
      "completes",
      "",
      "# CONSTRAINT SATISFIED",
      "No business data leaves the client at any point in the intelligence layer. Answers are "
      "computed, never generated."]),

    ("Challenges Faced and Solutions I",
     "Data-integrity defects, and how each was diagnosed",
     ["# AUTHORISATION FAILING SILENTLY",
      "Checks written against legacy role identifiers no seeded account carried — the most "
      "severe instance locked the administrator out of Settings entirely. Fixed by routing "
      "every check through shared role-predicate helpers.",
      "",
      "# ORDER DELIVERED AGAINST INSUFFICIENT STOCK",
      "The availability guard covered only one of three forward transitions. An order for 450 "
      "units was fulfilled against 250 in stock. Guard extended to all three transitions, and a "
      "partial-delivery mechanism added so a genuine shortfall does not block the order outright.",
      "",
      "# VISIT REPORTS REFERENCING NON-EXISTENT ORDERS",
      "The order-creation routine did not return the generated identifier. Fixed by returning "
      "and awaiting it.",
      "",
      "# INVENTORY DEDUCTIONS SILENTLY REVERTING",
      "Persistence calls issued without awaiting completion, overwritten by the next fetch. "
      "Fixed by awaiting all writes."]),

    ("Challenges Faced and Solutions II",
     "NLP and ML defects, each resolved through measurement",
     ["# NEAR-UNIFORM CLASSIFIER CONFIDENCE",
      "Softmax reported ~10% across all 17 classes. Traced to L2 normalisation compressing the "
      "log-score range; a scaling factor sharpened the posterior without changing the winner.",
      "",
      "# FUZZY MATCHING CORRUPTING VALID WORDS",
      "\"doing\" corrected to \"owing\", \"trader\" to \"order\". Edit budget for short tokens cut "
      "to one, plus a protected-word list.",
      "",
      "# SUBSTRING COLLISION",
      "\"total spending\" matched order status \"pending\". Replaced with whole-word boundary "
      "matching.",
      "",
      "# 14% OF ERRORS FROM ONE CONFUSION PAIR",
      "profit predicted as revenue_total, traced to ambiguous labels in my own training data. "
      "Restructuring the two classes' vocabulary eliminated it entirely.",
      "",
      "# OVERCONFIDENT OUTPUT",
      "Highest-scoring configuration reported 100% confidence on every query. Chose a lower "
      "scale: same accuracy, usable 64-100% confidence spread."]),

    ("Future Scope",
     "Acknowledged limitations and the next iterations they imply",
     ["# LIMITATIONS ACKNOWLEDGED",
      "* Bag-of-words with bigrams encodes no longer-range word order",
      "* 98.8% training vs 78.7% cross-validated accuracy indicates residual overfitting",
      "* Corpus authored by one person — reflects expected, not observed, phrasing",
      "* Predictive analytics module is statistical heuristics, explicitly not learned models",
      "",
      "# PLANNED WORK",
      "* Collect real query logs — replace assumed phrasing with an observed distribution",
      "* Sentence embeddings — break the bag-of-words ceiling past ~85% accuracy",
      "* Confidence calibration — Platt scaling or isotonic regression",
      "* Put the classifier in the operational path alongside the symbolic engine",
      "* K-means customer segmentation on RFM features — genuine unsupervised learning",
      "* Extend intent coverage to procurement, schemes, claims, complaints, field force",
      "* Automated regression suite over the order-to-cash and inventory paths",
      "* Server-side row-level security, independent of client-side correctness"]),

    ("Conclusion",
     "What was built, what was measured, and what it taught",
     ["# WHAT WAS BUILT",
      "An integrated distribution management, CRM and ERP platform in production use — 54 "
      "modules, 20,126 lines, 34 screens, a 30-table schema, RBAC across 15 roles — with an "
      "embedded natural language intelligence layer implementing intent classification, named "
      "entity recognition and dialogue state tracking, plus a statistical classifier written "
      "from first principles with no ML library.",
      "",
      "# WHAT WAS MEASURED",
      "78.7% +/- 2.7% cross-validated classification accuracy across 17 intents, roughly 13.3x "
      "the random baseline. No business data leaves the client; answers are computed, never "
      "generated.",
      "",
      "# WHAT IT TAUGHT",
      "The accuracy progression from 47.1% to 78.7% came from diagnosis, not from trying "
      "algorithms until one worked. The largest gain came from corpus work; the change made on "
      "the strongest theoretical grounds delivered 0.4 points and was kept as a documented "
      "negative result. Every integrity defect shared one shape: a rule enforced at one point "
      "in a workflow but not at every point where the underlying state could change.",
      "",
      "Measure before changing; keep the result when it contradicts the expectation."]),
]

if __name__ == "__main__":
    build(SLIDES, "Prismora_Full_Presentation.pptx",
          title="Prismora - Full Platform Presentation")
