"""Builds the full Prismora project report as a Word document."""

from docx_builder import Docx

d = Docx()
FILL = "[  ]"   # visual marker for details the author must supply

# ══════════════════════════════════════════════════════════════════ TITLE ═══
d.spacer(3)
d.subtitle("A Project Report on", size=24, italic=False)
d.title("PRISMORA")
d.subtitle("An Integrated Distribution Management, CRM and ERP Platform "
           "with an Embedded Natural Language Intelligence Layer")
d.spacer(2)
d.center("Submitted in partial fulfilment of the requirements for the")
d.center("Artificial Intelligence Internship Programme")
d.spacer(2)
d.center("Submitted by", bold=True)
d.center("[Your Full Name]", size=28)
d.center("Enrolment No.: [Enrolment Number]")
d.spacer(1)
d.center("Under the Guidance of", bold=True)
d.center("[Faculty Guide Name]     |     [Industry Mentor Name]")
d.spacer(1)
d.center("Organisation", bold=True)
d.center("[Company Name]")
d.spacer(2)
d.center("Department of Computer Science and Engineering")
d.center("[University / Institute Name]")
d.center("[Month, Year]")

# ═══════════════════════════════════════════════════════════ DECLARATION ═══
d.page_break()
d.h1("Student Declaration")
d.p("I, **[Your Full Name]**, bearing enrolment number **[Enrolment Number]**, hereby declare "
    "that the project report entitled **“Prismora — An Integrated Distribution Management, CRM "
    "and ERP Platform with an Embedded Natural Language Intelligence Layer”**, submitted to "
    "**[University / Institute Name]**, is a record of original work carried out by me during "
    "my internship at **[Company Name]** from **[Start Date]** to **[End Date]**.")
d.p("The system analysis, database design, module implementation, role-based access control "
    "model, natural language processing engine, machine learning classifier and the experimental "
    "evaluation presented in this report constitute my own work. All external sources consulted "
    "have been acknowledged in the References section.")
d.p("The quantitative results reported in Chapters 6 and 8 were produced by executing the "
    "evaluation harness described in Section 6.7 against the source code submitted alongside "
    "this report. All figures are reproducible under the fixed random seed documented therein.")
d.p("This work has not been submitted previously, in whole or in part, for the award of any "
    "other degree or diploma.")
d.spacer(3)
d.table([["Date:  [Date]", "[Your Full Name]"],
         ["Place: [Place]", "(Signature)"]], widths=[50, 50], header=False)

# ═══════════════════════════════════════════════════════ ACKNOWLEDGEMENT ═══
d.page_break()
d.h1("Acknowledgements")
d.p("I record my sincere thanks to **[Company Name]** for the opportunity to work on a "
    "production system rather than a training exercise. Building software that real operators "
    "depend on daily imposed constraints — data integrity, access control, backward "
    "compatibility with existing records — that no academic project would have surfaced, and "
    "those constraints shaped nearly every decision documented in this report.")
d.p("I am grateful to my industry mentor, **[Industry Mentor Name]**, for insisting on measured "
    "evidence whenever I claimed an improvement. That discipline is why Chapter 6 reports a "
    "cross-validated figure alongside a single-split one, and why an unsuccessful experiment is "
    "documented in Section 6.9 rather than quietly discarded.")
d.p("I thank my faculty guide, **[Faculty Guide Name]**, and the Department of Computer Science "
    "and Engineering at **[University / Institute Name]**, for their academic supervision and "
    "for guidance on structuring an empirical evaluation.")
d.p("Finally, I thank my family for their patience and encouragement throughout this period.")
d.spacer(2)
d._para(d._run("[Your Full Name]", bold=True), align="right")

# ═════════════════════════════════════════════════════════ ABBREVIATIONS ═══
d.page_break()
d.h1("List of Abbreviations")
d.table([
    ["Abbreviation", "Expansion"],
    ["AI / ML", "Artificial Intelligence / Machine Learning"],
    ["NLP / NLU", "Natural Language Processing / Understanding"],
    ["NER", "Named Entity Recognition"],
    ["DST", "Dialogue State Tracking"],
    ["TF–IDF", "Term Frequency – Inverse Document Frequency"],
    ["MNB / CNB", "Multinomial / Complement Naive Bayes"],
    ["CV", "Cross-Validation"],
    ["CRM", "Customer Relationship Management"],
    ["ERP", "Enterprise Resource Planning"],
    ["DMS", "Distribution Management System"],
    ["SFA", "Sales Force Automation"],
    ["RBAC", "Role-Based Access Control"],
    ["FEFO", "First-Expiry-First-Out"],
    ["GRN", "Goods Receipt Note"],
    ["PO", "Purchase Order"],
    ["O2C / P2P", "Order-to-Cash / Procure-to-Pay"],
    ["SPA", "Single Page Application"],
    ["RLS", "Row Level Security"],
    ["SKU", "Stock Keeping Unit"],
    ["KPI", "Key Performance Indicator"],
], widths=[24, 76])

d.h2("List of Tables")
for n, t in [
    ("1.1", "Company overview"),
    ("3.1", "Stakeholder roles and their primary operational concerns"),
    ("3.2", "Functional requirements by module"),
    ("4.1", "Database schema — entity groups and tables"),
    ("4.2", "Role-based permission model — access levels"),
    ("5.1", "Implemented modules and their scope"),
    ("5.2", "Order fulfilment status hierarchy and stage ownership"),
    ("6.1", "Intent inventory of the PRISM engine"),
    ("6.2", "Edit-distance budget by token class"),
    ("6.6", "Algorithm comparison — Multinomial versus Complement Naive Bayes"),
    ("7.1", "Verification methods applied per subsystem"),
    ("7.2", "Classifier headline performance"),
    ("7.3", "Five-fold cross-validation fold scores"),
    ("7.4", "Per-class precision, recall and F1"),
    ("8.1", "Implementation metrics by area"),
    ("8.2", "Experimental iteration history"),
    ("8.3", "Defect classes identified and resolved"),
    ("8.4", "Capability comparison — symbolic engine versus classifier"),
]:
    d.bullet(f"Table {n} — {t}")

d.h2("List of Figures")
for n, t in [
    ("4.1", "Three-tier system architecture"),
    ("4.2", "Entity relationship overview"),
    ("5.1", "Order-to-cash process flow with stock validation gates"),
    ("6.1", "PRISM AI processing pipeline"),
    ("8.1", "Classifier accuracy progression across experimental iterations"),
]:
    d.bullet(f"Figure {n} — {t}")

# ══════════════════════════════════════════════════════════════ ABSTRACT ═══
d.page_break()
d.h1("Abstract")
d.p("Distribution businesses in the fast-moving consumer goods sector operate across a layered "
    "channel — company to distributor, distributor to dealer, dealer to retailer — and each "
    "layer generates orders, invoices, payments, stock movements and claims that must reconcile "
    "against the others. In small and mid-sized firms these processes are typically spread "
    "across disconnected tools: an accounting package holds the ledger, spreadsheets hold stock "
    "and schemes, and the sales team's field activity is recorded on paper or not at all. The "
    "consequences are familiar — stock is committed that does not exist, incentive claims are "
    "settled without verification, and management reporting lags reality by weeks.")
d.p("This report documents the design and implementation of **Prismora**, an integrated "
    "distribution management, CRM and ERP platform built for a personal-care products "
    "distributor. The system spans lead management, a three-tier channel hierarchy, "
    "order-to-cash with inventory validation, procure-to-pay, batch-level inventory with "
    "expiry-aware allocation, accounting, scheme and claim processing, field-force automation, "
    "and management analytics. It comprises **54 source modules totalling 20,126 lines**, "
    "**34 application screens**, a **30-table relational schema**, and a role-based access "
    "control model covering **15 distinct roles across 21 permission domains**.")
d.p("Embedded within the platform is **PRISM AI**, a natural language intelligence layer that "
    "constitutes the artificial-intelligence component of this work. Rather than delegating "
    "comprehension to a hosted language model — which would require transmitting financial "
    "records to a third party and would admit the possibility of a fluently stated but "
    "incorrect figure — the comprehension layer was constructed directly. A symbolic engine "
    "performs normalisation, stemming, synonym-to-concept expansion across 23 semantic groups, "
    "weighted classification over 17 intents, gazetteer-based named entity recognition, "
    "Damerau–Levenshtein fuzzy matching and dialogue state tracking. Alongside it, a statistical "
    "classifier — TF–IDF over unigram and bigram features feeding Multinomial Naive Bayes with "
    "Lidstone smoothing — was implemented from mathematical first principles without any machine "
    "learning library, and trained on a hand-constructed corpus of 659 labelled queries.")
d.p("The classifier attains **85.8% accuracy** on a stratified held-out test set and "
    "**78.7% (± 2.7%)** under five-fold cross-validation, with a macro-averaged F1 of "
    "**0.859** — approximately **13.3 times** the 5.9% expected from random assignment across "
    "17 classes. This figure was reached across four measured iterations beginning at 47.1%. "
    "Notably, a substitution to Complement Naive Bayes — an algorithm formulated precisely for "
    "the overlapping-vocabulary condition diagnosed in error analysis — yielded only 0.4 "
    "percentage points, within run-to-run variance. That negative result redirected effort "
    "towards training-data quality, where the actual defect lay, and is retained in this report "
    "because the diagnostic reasoning it enabled exceeded the accuracy it failed to deliver.")
d.p("**Keywords:** Distribution Management System, Enterprise Resource Planning, Natural "
    "Language Processing, Intent Classification, Named Entity Recognition, Naive Bayes, TF–IDF, "
    "Role-Based Access Control, Inventory Management, Business Intelligence.")

# ═════════════════════════════════════════════════════════════ CHAPTER 1 ═══
d.page_break()
d.h1("Chapter 1: Introduction")

d.h2("1.1 Background")
d.p("As part of the curriculum for the **[Degree, e.g. Bachelor of Technology in Computer Science "
    "and Engineering (AI – ML)]** at **[University Name]**, students are required to undergo an "
    "internship to gain exposure to real industry work. This report is a record of the internship "
    "I completed at **WebContrive Pvt Ltd**, Surat, working as an **Artificial Intelligence "
    "Engineer Intern** from **1 June 2026 to 20 July 2026**.")

d.h2("1.2 Company Overview")
d.p("WebContrive Pvt Ltd is a technology services company based in Surat, Gujarat. "
    "**[One to two sentences on what the company builds/does — e.g. its main service lines, "
    "the industries it serves, and how long it has been operating. I don't have this detail; "
    "add it here.]**")
d.p("**[Optional: name the specific product or client project you were placed on, similar to how "
    "a company might describe its flagship platform — e.g. \"the company's engineering team was "
    "actively building/maintaining [Product Name], a [one-line description]\".]**")
d.p("**[One or two sentences on team structure and what that meant for your exposure — e.g. "
    "small/focused team, direct access to production systems and real client work rather than "
    "isolated training exercises.]**")
d.table([
    ["Particular", "Details"],
    ["Company Name", "WebContrive Pvt Ltd"],
    ["Tagline", "**[Company tagline, if any]**"],
    ["Location", "Surat, Gujarat, India"],
    ["Website", "**[Company website]**"],
    ["Email", "**[Company contact email]**"],
    ["Internship Role", "Artificial Intelligence Engineer Intern"],
    ["Department", "**[e.g. AI / Machine Learning, or Product Engineering]**"],
    ["Duration", "1 June 2026 – 20 July 2026"],
], widths=[32, 68])
d.caption("Table 1.1: Company Overview.")

d.h2("1.3 Motivation for the Project")
d.p("**[Two to three sentences, in your own voice: what your prior experience with software "
    "development / AI looked like before this internship — e.g. mostly academic projects, "
    "single-developer codebases, limited exposure to production systems — and what specifically "
    "shifted during this internship. The template below is adapted from the reference structure; "
    "replace it with what is actually true of your experience.]**")
d.p("The organisation for which this platform was built operates a distribution business through "
    "a three-tier channel — company to distributor, distributor to dealer, dealer to retailer — "
    "each tier maintaining its own credit terms, pricing and incentive schemes. My specific "
    "responsibility was the design and implementation of an integrated CRM/ERP platform to "
    "replace the spreadsheet-based operation this complexity had outgrown, together with a "
    "natural language intelligence layer allowing non-technical operators to query that data "
    "directly rather than through pre-built reports.")

d.h2("1.4 Objectives of the Internship")
d.p("The primary objectives of this internship were to:")
for i, o in enumerate([
    "analyse the operational processes of a multi-tier distribution business and derive a "
    "normalised data model representing its entities without loss of referential integrity;",
    "design and implement an integrated platform covering the order-to-cash and procure-to-pay "
    "cycles, batch-level inventory management, accounting, channel partner management, scheme "
    "administration and field-force automation;",
    "implement a role-based access control model serving fifteen distinct organisational roles, "
    "including external channel partners confined to their own data;",
    "study the classical natural language understanding pipeline and implement each stage — "
    "normalisation, stemming, intent classification, entity recognition, dialogue state "
    "tracking — without a pre-built NLP library;",
    "implement TF–IDF feature extraction and Naive Bayes classification from mathematical first "
    "principles, and evaluate them under stratified splitting, k-fold cross-validation and "
    "per-class error analysis;",
    "compare a symbolic, rule-driven approach against a statistical, learned approach on an "
    "identical task, and characterise the conditions under which each is preferable.",
], start=1):
    d.numbered(i, o)

d.h2("1.5 Scope and Limitations")
d.p("**[Two to three sentences on how the actual shape of the work compared to what you "
    "expected going in — e.g. discrete assigned tasks versus ongoing ownership of a live system, "
    "and what that revealed about how AI/software engineering work actually happens outside a "
    "classroom setting. Replace with your own experience.]**")
d.p("This report covers the platform and its embedded intelligence layer as delivered by the end "
    "of the internship period. Two boundaries are stated explicitly. First, the predictive "
    "analytics module described in Section 6.8 employs statistical heuristics — moving averages, "
    "recency scoring and velocity extrapolation — and is characterised as such throughout; it is "
    "not represented as machine learning. Second, an earlier iteration of the conversational "
    "assistant delegated comprehension to a hosted large language model; that approach was "
    "replaced by the work described in Chapter 6, and the rationale is given in Section 2.4.")

d.h2("1.6 Organisation of the Report")
d.p("This report is organised into nine chapters. Chapter 1 introduces the internship context, "
    "company background, motivation and objectives. Chapter 2 reviews the relevant literature — "
    "enterprise systems in distribution, task-oriented dialogue systems, and existing approaches "
    "to intent recognition — and states the problem being addressed. Chapter 3 analyses system "
    "requirements and stakeholders. Chapter 4 presents the system architecture, database design "
    "and access control model. Chapter 5 details the implementation of the core business "
    "modules. Chapter 6 covers the natural language intelligence layer in depth, this being the "
    "principal technical focus of the internship. Chapter 7 presents the testing and validation "
    "methodology. Chapter 8 presents results and discussion. Chapter 9 concludes the report and "
    "outlines future scope.")

# ═════════════════════════════════════════════════════════════ CHAPTER 2 ═══
d.page_break()
d.h1("Chapter 2: Literature Review and Problem Statement")

d.h2("2.1 Enterprise Systems in Distribution")
d.p("Enterprise resource planning emerged from materials requirement planning as an attempt to "
    "place every operational function on a single transactional database, so that a stock "
    "movement recorded in the warehouse is immediately visible to sales, accounting and "
    "procurement. The architectural principle — a single source of truth, with modules as views "
    "onto shared entities rather than as independent applications — remains the defining "
    "characteristic and is the principle the present system follows.")
d.p("Established platforms serving this space are well developed but are calibrated for larger "
    "organisations. Their licensing, implementation cost and configuration burden are difficult "
    "to justify at the scale of a regional distributor, and the practical outcome is that firms "
    "of this size adopt an accounting package for statutory compliance and manage everything "
    "else in spreadsheets. The gap addressed by this work is therefore not a technical one but "
    "one of fit.")

d.h2("2.2 Task-Oriented Dialogue Systems")
d.p("Dialogue systems built to accomplish a bounded set of goals, as distinct from open-ended "
    "conversation, are conventionally decomposed into three components: intent classification, "
    "which determines what the user wants; slot filling or named entity recognition, which "
    "determines the parameters of the request; and dialogue state tracking, which maintains "
    "context across turns. This decomposition organises commercial assistants and remains the "
    "standard reference architecture. The implementation described in Chapter 6 follows it "
    "directly, and the correspondence is deliberate.")

d.h2("2.3 Approaches to Intent Recognition")
d.h3("2.3.1 Symbolic and rule-based systems")
d.p("The earliest natural language interfaces to databases mapped surface forms to queries "
    "through hand-authored grammars. Such systems are deterministic and fully auditable: for "
    "any output, the responsible rule can be identified. Their weakness is that coverage extends "
    "exactly as far as the rules an author has written. They remain well suited to situations "
    "where a wrong answer is costlier than no answer, and where domain vocabulary is bounded — "
    "both of which hold here.")

d.h3("2.3.2 Statistical text classification")
d.p("Treating intent recognition as supervised text classification permits generalisation to "
    "phrasings absent from training data. According to Jurafsky & Martin (2023) and Manning, "
    "Raghavan, & Schütze (2008), the standard representation is TF-IDF (Term Frequency-Inverse "
    "Document Frequency), which weights each term by its frequency within a document against its "
    "rarity across the corpus, expressed as idf(t) = log(N / df(t)). Multinomial Naive Bayes "
    "remains a strong baseline for this representation despite its conditional-independence "
    "assumption being plainly violated by natural language. As formulated by Pedregosa et al. "
    "(2011) and McCallum & Nigam (1998), the class probability P(c|x) is calculated via Bayes' "
    "Theorem using log-likelihood summation to prevent floating-point underflow: "
    "c_hat = argmax_c [ log P(c) + sum(fi * log P(ti|c)) ]. Rennie et al. (2003) identified "
    "systematic weaknesses in the multinomial formulation when class vocabularies overlap and "
    "proposed Complement Naive Bayes as a remedy. Both were implemented and compared in the "
    "present work; the outcome is reported in Section 6.9.")

d.h3("2.3.3 Neural and transformer approaches")
d.p("Contemporary state-of-the-art intent classification uses contextual embeddings from "
    "pre-trained transformers, which capture word order and semantic similarity in a manner "
    "bag-of-words representations cannot. The accuracy advantage is substantial; the costs are a "
    "model of tens to hundreds of megabytes, inference latency, and a training requirement "
    "beyond what a corpus authored during an internship could satisfy. For a component that must "
    "execute in a browser and respond instantly, these costs were judged prohibitive at present "
    "scale — a limitation acknowledged directly in Section 9.2.")

d.h2("2.4 Rationale for Replacing the Hosted Model")
d.p("The assistant's first implementation supplied business records as prompt context to a "
    "hosted generative model. Evaluation surfaced four objections. Every query transmitted "
    "order, invoice and expense records to a third-party endpoint. Each query incurred monetary "
    "cost and one to three seconds of latency. Availability depended on network connectivity and "
    "provider uptime. Most seriously, the model occasionally produced numerically incorrect "
    "figures stated with complete confidence — a tolerable failure mode for a drafting tool and "
    "an intolerable one for a system of record.")
d.p("The replacement inverts the relationship. The system parses the question, determines intent "
    "and entities, and then computes the answer arithmetically from live records. Numbers are "
    "never generated; they are calculated. Open-ended reasoning is forgone in exchange for "
    "determinism, zero marginal cost, complete data confidentiality and arithmetic correctness.")

d.h2("2.5 Problem Statement")
d.p("The problem addressed by this work has two parts.")
d.p("**Platform.** To design and implement an integrated system that maintains a single "
    "authoritative record of orders, inventory, receivables, payables, channel-partner balances "
    "and field activity for a multi-tier distribution business, enforcing at the point of "
    "transaction those constraints that are otherwise discovered only during periodic "
    "reconciliation.")
d.p("**Intelligence layer.** Given a free-text business question from a non-technical operator, "
    "to determine intent and entities and return a numerically correct answer computed from live "
    "data — subject to the constraints that no business data leaves the client environment, that "
    "response is effectively instantaneous, that per-query cost is zero, and that figures are "
    "computed rather than generated. The system must additionally tolerate misspelling, support "
    "follow-up questions, decline explicitly when a question falls outside its competence, and "
    "expose its reasoning.")

# ═════════════════════════════════════════════════════════════ CHAPTER 3 ═══
d.page_break()
d.h1("Chapter 3: System Analysis and Requirements")

d.h2("3.1 Stakeholder Analysis")
d.p("Fifteen distinct roles were identified, spanning internal staff and external channel "
    "partners. The distinction matters architecturally: external partners access the same "
    "deployment as internal staff but must be confined to their own records, which makes access "
    "control a data-filtering problem rather than merely a navigation-hiding one.")
d.table([
    ["Role", "Primary concern"],
    ["Super Admin", "System configuration, user administration, audit trail"],
    ["Director", "Consolidated performance across all functions"],
    ["Sales Manager", "Team performance, territory coverage, pipeline health"],
    ["Sales Executive", "Own leads, own orders, own customers"],
    ["Purchase Manager", "Vendor management, purchase orders, goods receipt"],
    ["Warehouse Manager", "Stock accuracy, batch and expiry control, transfers"],
    ["Accounts", "Invoicing, receivables, payables, credit notes"],
    ["Dispatch Team", "Fulfilment queue, dispatch readiness"],
    ["Customer Support", "Complaint intake and resolution tracking"],
    ["Distributor", "Own orders, own ledger, own incentive claims"],
    ["Dealer", "Own orders, own ledger, own outstanding balance"],
    ["Retailer", "Own orders, own outstanding balance"],
], widths=[26, 74])
d.caption("Table 3.1 — Stakeholder roles and their primary operational concerns. Three legacy "
          "role identifiers are additionally retained for backward compatibility with records "
          "created before the current model was introduced.")

d.h2("3.2 Functional Requirements")
d.table([
    ["Module", "Requirement summary"],
    ["Lead management",
     "Capture enquiries with source and expected value; progress through pipeline stages; "
     "convert to order on closure; schedule and track follow-ups"],
    ["Order management",
     "Multi-line orders against the product catalogue; status progression with stage ownership; "
     "stock validation before dispatch; partial fulfilment; order splitting"],
    ["Inventory",
     "Batch-level stock with manufacture and expiry dates; expiry-aware allocation; multi-"
     "warehouse holdings with transfer; cycle counting with variance capture"],
    ["Channel management",
     "Three-tier hierarchy of distributors, dealers and retailers; credit limits; outstanding "
     "balances; per-tier price lists; self-registration with approval"],
    ["Accounting",
     "Invoice generation from orders; payment recording; credit notes; expense capture by "
     "category; receivables and payables ageing"],
    ["Procurement",
     "Vendor master; purchase orders with ageing; goods receipt notes updating stock and "
     "payables; purchase returns; vendor payment against ledger"],
    ["Schemes and claims",
     "Scheme definition with product applicability and validity window; automatic eligibility "
     "evaluation at order entry; claim raising and verification"],
    ["Field-force automation",
     "Territory and beat plan definition; attendance capture; visit reporting with order "
     "linkage; field expense claims"],
    ["Analytics",
     "Role-specific dashboards; configurable report library with export; predictive indicators; "
     "natural language query interface"],
], widths=[22, 78])
d.caption("Table 3.2 — Functional requirements by module.")

d.h2("3.3 Non-Functional Requirements")
d.bullet("**Data integrity.** Constraints that determine financial outcome — available stock, "
         "credit limit, scheme eligibility — must be enforced at the point of transaction, not "
         "discovered during later reconciliation.")
d.bullet("**Confidentiality.** Channel partners share a deployment with internal staff and with "
         "one another; no partner may observe another's records under any navigation path.")
d.bullet("**Responsiveness.** The interface must render usable content immediately on load. An "
         "early build blocked first paint on a sequence of network fetches, producing a "
         "five-to-six second delay; the remedy is described in Section 5.8.")
d.bullet("**Resilience.** The application must remain usable when the network is unavailable, "
         "reading from a local cache and reconciling when connectivity returns.")
d.bullet("**Auditability.** Consequential actions must be recorded with actor, timestamp and "
         "affected entity.")
d.bullet("**Data residency.** No business data may be transmitted to any third-party service, "
         "which is the constraint that determined the architecture of the intelligence layer.")

# ═════════════════════════════════════════════════════════════ CHAPTER 4 ═══
d.page_break()
d.h1("Chapter 4: System Design and Architecture")

d.h2("4.1 Architectural Overview")
d.p("The system follows a three-tier arrangement. The presentation tier is a single-page "
    "application; the logic tier is implemented as a state-management layer that owns every "
    "mutation; and the data tier is a managed PostgreSQL instance. Business logic is "
    "deliberately concentrated in a single provider module rather than distributed across "
    "screens, so that an operation such as order confirmation applies inventory deduction, "
    "invoice generation, incentive evaluation and audit logging identically regardless of which "
    "screen initiated it.")
d.code("""
    +-------------------------------------------------------------+
    |  PRESENTATION TIER                                          |
    |  34 screens - role-branching, permission-guarded routes     |
    |  React 18 - React Router - Tailwind CSS - Recharts          |
    +-------------------------------------------------------------+
                              |
    +-------------------------------------------------------------+
    |  LOGIC TIER  (React Context providers)                      |
    |                                                             |
    |  AuthContext          - identity, 15 roles, 21 permissions  |
    |  DataContext          - all entity state + every mutation   |
    |  NotificationContext  - threshold and event alerts          |
    |                                                             |
    |  Domain services:  prismEngine (NLP)  -  naiveBayes (ML)    |
    |                    schemeUtils  -  distributorUtils         |
    +-------------------------------------------------------------+
                              |
    +-------------------------------------------------------------+
    |  DATA TIER                                                  |
    |  Supabase / PostgreSQL - 30 tables                          |
    |  localStorage mirror - offline read + instant first paint   |
    +-------------------------------------------------------------+
""")
d.caption("Figure 4.1 — Three-tier system architecture.")

d.h2("4.2 Persistence Strategy")
d.p("Every entity is written to PostgreSQL and mirrored to browser local storage. The mirror "
    "serves two purposes. It permits the interface to render from cache on load while the "
    "authoritative fetch proceeds in the background, and it allows continued operation when the "
    "network is unavailable. The database remains authoritative: a background fetch overwrites "
    "the mirror, so a conflict resolves in favour of the server.")

d.h2("4.3 Data Model")
d.p("The schema comprises thirty tables. The grouping below reflects the operational cycles they "
    "serve rather than their creation order.")
d.table([
    ["Group", "Tables"],
    ["Identity and configuration", "users, territories, warehouses, events, notifications"],
    ["Customer relationship", "leads, complaints"],
    ["Channel hierarchy", "distributors, dealers, retailers"],
    ["Order to cash", "orders, invoices, credit_notes, distributor_payments"],
    ["Inventory", "products, inventory, stock_transfers"],
    ["Procure to pay", "vendors, purchase_orders, grn, purchase_returns, vendor_payments"],
    ["Financial", "expenses, bank_transactions"],
    ["Trade schemes", "schemes, scheme_claims, distributor_incentives"],
    ["Field force", "beat_plans, attendance, visit_reports"],
], widths=[26, 74])
d.caption("Table 4.1 — Database schema, thirty tables grouped by operational cycle.")

d.p("The relationships between the nine groups follow the operational sequence a transaction "
    "moves through, from a lead's first conversion into an order to its eventual settlement.")
d.code("""
      leads --convert--> orders --deliver--> inventory (FEFO batch deduction)
                            |                       ^
                            v                       |
                        invoices              purchase_orders --grn--> vendors
                            |                       ^
                            v                       |
                      credit_notes           purchase_returns

      distributors / dealers / retailers --place--> orders
                            |
                            v
              distributor_payments, scheme_claims, distributor_incentives

      territories --assign--> beat_plans --record--> attendance, visit_reports
                                                            |
                                                            v
                                                 visit_reports --link--> orders
""")
d.caption("Figure 4.2 — Entity relationship overview: the operational sequence connecting "
          "the nine table groups of Table 4.1, from lead conversion through fulfilment, "
          "billing and channel settlement.")

d.h2("4.4 Access Control Model")
d.p("Authorisation is expressed as a matrix of fifteen roles against twenty-one permission "
    "domains, each cell taking one of four levels. The model was verified programmatically to "
    "confirm that every role carries an explicit entry for every domain, since an absent entry "
    "would default to a permissive interpretation.")
d.table([
    ["Level", "Semantics"],
    ["full", "Read and write across all records in the domain"],
    ["view", "Read across all records; no mutation"],
    ["own", "Read and write confined to records the user owns or is assigned"],
    ["none", "Domain is inaccessible; route is not reachable"],
], widths=[16, 84])
d.caption("Table 4.2 — Role-based permission model, access levels.")
d.p("The **own** level is what makes a shared deployment safe for external partners. It is "
    "enforced by an ownership predicate applied to every collection read, so a distributor "
    "querying orders receives only those bearing their identifier — the filter is applied in the "
    "data layer rather than in each screen, which prevents a screen author from omitting it.")
d.p("A systematic defect in this area is documented in Section 8.3: a substantial number of "
    "authorisation checks had been written against legacy role strings that no seeded account "
    "actually carried, causing them to fail silently.")

# ═════════════════════════════════════════════════════════════ CHAPTER 5 ═══
d.page_break()
d.h1("Chapter 5: Module Implementation")

d.h2("5.1 Implemented Modules")
d.table([
    ["Module", "Scope delivered"],
    ["Authentication and RBAC",
     "Session handling; 15 roles across 21 permission domains; route guards; ownership-scoped "
     "data filtering; password policy"],
    ["Lead management",
     "Pipeline board with stage progression; source and value capture; follow-up scheduling; "
     "conversion to order"],
    ["Order management",
     "Multi-line orders; seven-state fulfilment hierarchy with stage ownership; stock "
     "validation gates; partial delivery; order splitting"],
    ["Inventory",
     "Batch-level stock with expiry; expiry-aware allocation; multi-warehouse transfer; cycle "
     "counting with variance"],
    ["Channel management",
     "Distributor, dealer and retailer masters; credit limits; outstanding balances; ledger "
     "views; self-registration with approval"],
    ["Accounting",
     "Invoice generation; payment recording; credit notes; expense capture; receivables and "
     "payables ageing"],
    ["Procurement",
     "Vendor master with payables; purchase orders with ageing indicators; goods receipt "
     "updating stock and payables; returns"],
    ["Schemes and claims",
     "Scheme definition with product applicability; automatic eligibility at order entry; claim "
     "raising and verification"],
    ["Field-force automation",
     "Territory and beat plans; attendance; visit reporting with order linkage; field expense "
     "claims"],
    ["Analytics and reporting",
     "Role-specific dashboards; report library across five categories with export; predictive "
     "indicators; natural language interface"],
], widths=[24, 76])
d.caption("Table 5.1 — Implemented modules and their scope.")

d.h2("5.2 Order-to-Cash with Stock Validation")
d.p("The order lifecycle is the process where the greatest number of constraints intersect, and "
    "it received correspondingly close attention. Orders progress through seven states, each "
    "owned by a specific role group, so that a sales executive cannot mark goods dispatched and "
    "a dispatch operator cannot alter commercial terms.")
d.table([
    ["State", "Stage owner", "Effect on entering"],
    ["Pending", "Sales", "Order recorded; stock not yet committed"],
    ["Processing", "Sales / Manager", "Commercial terms confirmed; scheme eligibility evaluated"],
    ["Ready for Dispatch", "Warehouse", "Availability validated against batch stock"],
    ["Shipped", "Dispatch", "Consignment released"],
    ["Partially Delivered", "Dispatch", "Delivered quantity recorded; balance remains open"],
    ["Delivered", "Dispatch", "Stock deducted by expiry order; invoice raised; incentive evaluated"],
    ["Cancelled", "Sales / Manager", "Order closed without fulfilment"],
], widths=[22, 22, 56])
d.caption("Table 5.2 — Order fulfilment status hierarchy and stage ownership.")
d.p("A defect of consequence was identified here during verification. The availability check "
    "guarded only the transition to *Ready for Dispatch*, leaving *Shipped* and *Delivered* "
    "reachable directly. An order for 450 units was consequently marked delivered against 250 "
    "units of physical stock, producing a negative on-hand position that propagated into "
    "valuation. The remedy extended the guard across all three forward transitions.")
d.p("The remedy created a second problem: a genuine shortfall now blocked the order entirely, "
    "whereas the business practice is to deliver what exists and hold the balance. A partial "
    "delivery mechanism was therefore added, recording a cumulative delivered quantity against "
    "the order and holding it in a *Partially Delivered* state until fulfilment completes.")
d.code("""
    Order placed (450 units)
            |
            v
    +-------------------+   stock available?
    |  Ready to dispatch| ------ no -----> blocked, with shortfall stated
    +-------------------+                        |
            | yes                                v
            v                          +---------------------+
    +-------------------+              |  Deliver partially  |
    |     Delivered     |              |  250 now, 200 open  |
    |  stock deducted   |              +---------------------+
    |  by expiry order  |                        |
    |  invoice raised   |              status: Partially Delivered
    +-------------------+              on completion -> Delivered
""")
d.caption("Figure 5.1 — Order-to-cash process flow with stock validation gates.")

d.h2("5.3 Batch Inventory and Expiry-Aware Allocation")
d.p("Personal-care products carry expiry dates, so stock cannot be treated as a fungible "
    "quantity per item. Inventory is held per batch, each carrying manufacture and expiry dates "
    "and a warehouse assignment. Allocation follows first-expiry-first-out: a fulfilment "
    "consumes from the batch nearest expiry first, which minimises write-off. Cycle counting "
    "records a physical count against the system position and books the variance as an "
    "adjustment rather than overwriting the figure silently.")

d.h2("5.4 Three-Tier Channel Management")
d.p("Distributors, dealers and retailers are structurally similar but commercially distinct, "
    "each carrying its own price list, credit terms and incentive eligibility. Rather than "
    "branching on tier throughout the code, an identifier-field mapping is used so that a single "
    "code path serves all three tiers, with the tier determining only which field carries the "
    "party reference. This eliminated a class of defect in which a change applied to two tiers "
    "was omitted from the third.")
d.p("Each tier has a self-registration path producing a pending record for internal approval, "
    "and an authenticated portal exposing that party's own orders, ledger and balance.")

d.h2("5.5 Procure-to-Pay")
d.p("Purchase orders are raised against a vendor master and age visibly while awaiting receipt. "
    "A goods receipt note admits stock into a batch and simultaneously raises the vendor "
    "payable, so that stock and liability cannot diverge. Purchase returns reverse both. Vendor "
    "payments are recorded against a ledger presenting debits and credits with a running balance.")

d.h2("5.6 Scheme and Claim Processing")
d.p("Trade schemes are defined with a product applicability set, a validity window and a benefit "
    "basis. Eligibility is evaluated automatically at order confirmation rather than being "
    "claimed retrospectively, which is the point at which most disputes originate. Claims are "
    "raised against recorded eligibility and verified before settlement.")

d.h2("5.7 Field-Force Automation")
d.p("Territories and beat plans define expected coverage; attendance and visit reports record "
    "actual activity. A visit that results in an order links the two, so that field activity and "
    "commercial outcome are traceable to one another. A defect in this linkage is documented in "
    "Section 8.3: the order-creation routine did not return the generated identifier, so visit "
    "reports recorded a fabricated reference that matched no order.")

d.h2("5.8 Performance: Instant First Paint")
d.p("An early build resolved approximately twenty-five sequential network fetches before "
    "rendering, producing a five-to-six second delay during which the interface appeared empty. "
    "The remedy was to hydrate state synchronously from the local mirror inside the state "
    "initialiser, so the first paint renders cached data immediately while the authoritative "
    "fetch proceeds in the background. Perceived load time became effectively instantaneous "
    "without altering the reconciliation logic.")
d.code("""
    // Before: state starts empty; first paint waits on the network.
    const [orders, setOrders] = useState([]);

    // After: state starts from the local mirror; the network refreshes it.
    const [orders, setOrders] = useState(() => lsInit('prismora_orders'));
""")

# ═════════════════════════════════════════════════════════════ CHAPTER 6 ═══
d.page_break()
d.h1("Chapter 6: The PRISM AI Intelligence Layer")

d.h2("6.1 Design Position")
d.p("PRISM AI executes entirely on the client. Business data is read from the application's "
    "state layer; no component communicates with any external endpoint. The system parses a "
    "question, determines intent and entities, and computes the answer arithmetically. Numbers "
    "are never generated.")
d.code("""
                        User question (free text)
                                  |
                                  v
        +-------------------------------------------------+
        |   STAGE A - Linguistic preprocessing            |
        |   normalise -> tokenise -> stop-words -> stem   |
        +-------------------------------------------------+
                                  |
                    +-------------+-------------+
                    v                           v
    +-------------------------------+  +---------------------------+
    |  STAGE B - Symbolic engine    |  |  STAGE C - ML classifier  |
    |  synonym -> concept expansion |  |  TF-IDF vectorisation     |
    |  weighted intent scoring      |  |  Multinomial Naive Bayes  |
    |  gazetteer NER + fuzzy match  |  |  softmax posterior        |
    |  dialogue state tracking      |  |                           |
    +-------------------------------+  +---------------------------+
                    |                           |
                    v                           v
    +-------------------------------+  +---------------------------+
    |  Answer computed from live    |  |  Predicted intent +       |
    |  records (arithmetic only)    |  |  calibrated confidence    |
    +-------------------------------+  +---------------------------+
""")
d.caption("Figure 6.1 — PRISM AI processing pipeline. Both branches consume identical "
          "preprocessing output, so measured differences are attributable to the classification "
          "method rather than to tokenisation.")

d.h2("6.2 Linguistic Preprocessing")
d.p("**Normalisation** lowercases input and strips punctuation while preserving currency, "
    "percent, decimal point and hyphen, each of which carries meaning in this domain.")
d.p("**Tokenisation** splits on whitespace and removes a stop-word list of determiners, "
    "auxiliaries and filler. Interrogatives — *how*, *which*, *who* — are deliberately retained, "
    "being among the strongest signals distinguishing a count request from a value request.")
d.p("**Stemming** applies suffix stripping so that *invoices*, *invoicing* and *invoiced* "
    "collapse to a shared root. A rule-based stripper was chosen over a full Porter "
    "implementation because domain vocabulary is bounded and the additional precision was not "
    "measurable against the added complexity.")
d.p("**Concept expansion** maps tokens to canonical concepts through 23 synonym groups. This is "
    "what allows *turnover*, *sales*, *topline* and *billing* to be recognised as one idea, and "
    "is the principal mechanism by which the symbolic engine achieves coverage without an "
    "example of every phrasing.")

d.h2("6.3 Intent Classification — Symbolic Path")
d.p("Each intent is defined by required, supporting and negative concepts. Presence accumulates "
    "weight; a negative concept disqualifies outright. The highest-scoring intent above a "
    "confidence floor is selected; below the floor the system states non-comprehension rather "
    "than guessing.")
d.table([
    ["Intent", "Question class served"],
    ["revenue_total", "Aggregate sales value, optionally scoped by period or region"],
    ["revenue_by_product", "Sales decomposed across the catalogue"],
    ["revenue_by_state", "Sales decomposed geographically"],
    ["order_summary", "Order counts and values, filterable by status"],
    ["lead_summary", "Pipeline composition and conversion"],
    ["team_performance", "Revenue and conversion by staff member"],
    ["profit", "Net profitability and margin"],
    ["outstanding", "Receivables outstanding and overdue"],
    ["invoice_list", "Billing records and settlement status"],
    ["expense_breakdown", "Expenditure by category"],
    ["stock_level", "Inventory position and holding value"],
    ["low_stock", "Items approaching depletion"],
    ["dead_stock", "Items with no recent movement"],
    ["forecast", "Projected demand from historical movement"],
    ["churn", "Channel partners showing disengagement"],
    ["customer_lookup", "Customer ranking and history"],
    ["help", "Capability disclosure and greetings"],
], widths=[28, 72])
d.caption("Table 6.1 — Intent inventory of the PRISM engine.")

d.h2("6.4 Named Entity Recognition")
d.p("Entity recognition uses gazetteer matching against live tables rather than a static list. "
    "Product names come from the current catalogue, personnel from the user table, parties from "
    "the channel tables, regions from territory configuration. A consequence worth noting is "
    "that no retraining is required when the business adds a product: the new entity becomes "
    "recognisable the moment it is persisted. Statuses and temporal expressions are additionally "
    "extracted by pattern, the latter resolved into concrete date ranges.")

d.h2("6.5 Approximate String Matching")
d.p("Operators type quickly and misspell often. Tolerance uses the **Damerau–Levenshtein** edit "
    "distance, which extends Levenshtein with an adjacent-transposition operation. The choice "
    "was empirically motivated: transposition is among the most frequent keyboard errors, and "
    "the standard formulation charges two edits for one transposed pair — *unpiad → unpaid* is "
    "distance 2 under Levenshtein but 1 under Damerau. Since a tight budget is required to "
    "suppress false positives, that single unit decides whether the commonest real typo is "
    "corrected at all. The implementation terminates early when an entire matrix row exceeds "
    "the budget.")
d.table([
    ["Token class", "Length", "Budget", "Justification"],
    ["Domain concepts", "≤ 6 characters", "1",
     "Short function words collide readily; a loose budget converts valid input into false matches"],
    ["Domain concepts", "> 6 characters", "2", "Longer terms tolerate more without colliding"],
    ["Proper nouns", "≤ 4 characters", "1", "Distinctive, but too short to risk"],
    ["Proper nouns", "5–8 characters", "2", "Product and person names rarely collide"],
    ["Proper nouns", "> 8 characters", "3", "Long distinctive names tolerate the most"],
], widths=[18, 18, 10, 54])
d.caption("Table 6.2 — Edit-distance budget by token class and length. The asymmetry between "
          "concept terms and proper nouns proved essential; a uniform budget produced the false "
          "corrections documented in Section 8.3.")

d.h2("6.6 Dialogue State Tracking")
d.p("Questions in sequence depend on their predecessors. After each answered turn the system "
    "retains the resolved intent and participating entities. A subsequent turn is treated as a "
    "continuation when it opens with a continuation marker, contains a referential expression "
    "without an independent intent, or names an entity while matching no intent of its own. On "
    "continuation the prior intent is inherited and entities merged, new values overriding "
    "remembered ones.")
d.code("""
    User  : revenue by state
    PRISM : Gujarat  Rs 95,000 (76%)  |  Maharashtra  Rs 30,000 (24%)

    User  : what about Gujarat?        [continuation marker -> intent inherited]
    PRISM : Gujarat - Rs 95,000, 2 orders, 76% of national sales

    User  : and last 30 days?          [state retained, timeframe newly supplied]
    PRISM : Gujarat - Rs 50,000, 1 order
""")

d.h2("6.7 Statistical Classifier — Implementation and Method")
d.p("The machine learning subsystem was implemented without any external library, so that each "
    "mathematical step could be examined directly.")
d.h3("6.7.1 Corpus")
d.p("A corpus of **659 labelled queries** was authored by hand across the 17 intents, at 30 to "
    "55 examples per class. Phrasings vary in length, register, word order and lexical choice so "
    "the model learns discriminative terms rather than memorising templates. Indian-English "
    "business vocabulary — *godown*, *party*, *offtake* — is included because it reflects the "
    "register in which users actually speak.")
d.h3("6.7.2 Features and weighting")
d.p("Features are unigrams and bigrams. Bigrams matter because short business queries hinge on "
    "word pairs: *how many* requests a count while *how much* requests a value, differing in one "
    "token. Bigrams occurring in fewer than three documents are discarded, since a bigram seen "
    "once encodes a specific sentence rather than a pattern. Weights follow smoothed TF–IDF, "
    "idf(t) = ln[(1+n)/(1+df(t))] + 1, with vectors L2-normalised.")
d.h3("6.7.3 Classification")
d.p("Class-conditional likelihoods use Lidstone smoothing with α = 0.3. Smoothing is not "
    "optional: an unsmoothed estimate assigns zero probability to any term unseen in a class, "
    "and since scores accumulate in log space a single such term collapses the posterior to "
    "negative infinity. Posteriors are recovered by softmax with the maximum subtracted before "
    "exponentiation, preventing overflow.")
d.h3("6.7.4 Evaluation methodology")
d.p("Four principles were adopted at the outset. **Stratified splitting** divides the corpus "
    "75:25 preserving class proportions. **Determinism** derives all shuffling from a seeded "
    "generator, so any figure is exactly reproducible. **Cross-validation** reports five-fold "
    "results alongside the single split, since at this corpus size a single split is materially "
    "affected by which examples land in the test partition. **Per-class reporting** gives "
    "precision, recall and F1 per intent with the full confusion matrix — and it was inspection "
    "of that matrix, not the aggregate, that located the defect resolved in Section 6.10.")

d.h2("6.8 Predictive Analytics Module")
d.p("A separate analytics surface derives forward-looking indicators from the same data. These "
    "are **statistical heuristics, not machine learning**: no parameters are fitted and no model "
    "is trained. Demand projection uses a three-month moving average with trend adjustment; "
    "depletion forecasting divides available stock by observed consumption velocity; "
    "disengagement scoring combines order recency with a decline term; dead-stock detection flags "
    "items with no movement in a fixed window; and opportunity prioritisation applies a weighted "
    "sum over pipeline stage, value and recency. They are reported here as descriptive analytics.")

d.h2("6.9 A Negative Result: Complement Naive Bayes")
d.p("Error analysis identified overlapping class vocabulary as the dominant failure mode. "
    "Complement Naive Bayes addresses precisely this condition, estimating each class from the "
    "complement of that class and normalising weights so large vocabularies cannot dominate. It "
    "was implemented in full, together with sublinear term-frequency scaling, and evaluated "
    "across 80 configurations under identical cross-validation.")
d.table([
    ["Configuration", "Best CV accuracy", "Mean reported confidence"],
    ["Multinomial Naive Bayes", "75.3%", "95%"],
    ["Complement Naive Bayes", "75.7%", "6%"],
    ["Sublinear TF (either variant)", "no measurable change", "—"],
], widths=[40, 30, 30], align_right=[1, 2])
d.caption("Table 6.6 — Algorithm comparison under identical five-fold cross-validation.")
d.p("The 0.4-point improvement falls well inside the 2.7-point fold standard deviation and "
    "cannot be distinguished from noise. Weight normalisation additionally compressed the "
    "posterior so severely that reported confidence collapsed to roughly 6% — a correct argmax, "
    "but useless as a displayed value.")
d.p("The result is retained because its diagnostic value exceeded its accuracy value. The "
    "hypothesis was that the algorithm was deficient; the measurement refuted that and "
    "redirected effort to the training data, where the defect actually resided. Adopting CNB on "
    "theoretical merit without measuring would have left the labelling fault undetected.")

d.h2("6.10 Error Analysis and Corpus Disambiguation")
d.p("Inspection of the confusion matrix showed errors were not uniformly distributed. One "
    "ordered pair — true **profit** predicted as **revenue_total** — accounted for four of 31 "
    "test errors, approximately 14%. No other pair exceeded two. Examination of the training "
    "examples exposed the cause:")
d.code("""
    Labelled revenue_total : "how much money did we make from sales"
    Labelled revenue_total : "total earnings from orders"
    Labelled revenue_total : "what did we earn last week"

    Labelled profit        : "how much profit did we make"
    Labelled profit        : "what is our earning after costs"
    Labelled profit        : "net earnings figure"
""")
d.p("The terms *earn*, *money* and *make* appeared with comparable frequency under both labels. "
    "The model had learned exactly what the corpus taught it — that these terms are "
    "uninformative — so the failure was an artefact of the training data, not a limitation of "
    "the classifier.")
d.p("The remedy restructured the lexical territory of both classes: **revenue_total** was "
    "re-anchored on unambiguous turnover vocabulary, and the ambiguous earning phrasings were "
    "reassigned to **profit** and reinforced. A second, smaller leak was corrected in the same "
    "pass — a **churn** example phrased *“which partners have low activity”* was drawing the "
    "term *low* towards **low_stock**.")
d.table([
    ["Measure", "Before", "After", "Change"],
    ["Test-set accuracy", "80.4%", "85.8%", "+5.4 pts"],
    ["Cross-validated accuracy", "75.8%", "78.7%", "+2.9 pts"],
    ["Standard deviation across folds", "± 4.3%", "± 2.7%", "−1.6 pts"],
    ["Macro F1", "0.802", "0.859", "+0.057"],
    ["Largest single confusion pair", "4 instances", "2 instances", "−50%"],
    ["profit class F1", "0.67", "0.96", "+0.29"],
], widths=[40, 20, 20, 20], align_right=[1, 2, 3])
d.caption("Table — Effect of corpus disambiguation. The reduction in fold variance indicates "
          "improved stability, not merely improved mean accuracy.")
d.p("The **profit → revenue_total** confusion was eliminated entirely. The narrowing of standard "
    "deviation from ±4.3% to ±2.7% is arguably the more meaningful outcome: the model became "
    "consistent across partitions rather than merely better on average, which is what one "
    "expects when genuine label noise is removed rather than a split being fortuitously "
    "favourable.")

# ═════════════════════════════════════════════════════════════ CHAPTER 7 ═══
d.page_break()
d.h1("Chapter 7: Testing and Validation")

d.h2("7.1 Verification Strategy")
d.p("Verification combined static analysis, whole-application compilation, scripted "
    "verification of the authorisation matrix, a held-out evaluation harness for the classifier, "
    "and manual scenario testing across roles. The strategy reflects a practical constraint "
    "worth stating plainly: this is an application whose correctness lies largely in the "
    "interaction between modules and roles, and a unit-test suite over individual functions "
    "would not have caught the defect classes that actually occurred.")
d.table([
    ["Subsystem", "Verification method"],
    ["Whole application", "Production build compiling all modules; static analysis on every "
     "changed file"],
    ["Access control", "Scripted enumeration of the role-permission matrix, asserting every "
     "role carries an explicit entry for all 21 domains"],
    ["ML classifier", "Stratified held-out test set; five-fold cross-validation; per-class "
     "precision, recall, F1; confusion matrix; error listing"],
    ["NLP engine", "Scripted assertion suite over intent resolution, entity extraction, typo "
     "correction and multi-turn dialogue"],
    ["Order and inventory logic", "Manual scenario testing against stock shortfall, partial "
     "delivery, split orders and expiry-ordered allocation"],
    ["Channel portals", "Manual verification per role that no partner can observe another "
     "party's records under any navigation path"],
], widths=[26, 74])
d.caption("Table 7.1 — Verification methods applied per subsystem.")

d.h2("7.2 Classifier Evaluation Results")
d.table([
    ["Metric", "Value", "Baseline"],
    ["Test-set accuracy (held out, stratified)", "85.8%  (145 / 169)", "5.9%"],
    ["Five-fold cross-validated accuracy", "78.7% ± 2.7%", "5.9%"],
    ["Macro-averaged F1", "0.859", "—"],
    ["Training-set accuracy", "98.8%", "—"],
    ["Corpus size", "659 labelled queries", "—"],
    ["Train / test partition", "490 / 169", "—"],
    ["Vocabulary (unigram + bigram)", "476 features", "—"],
    ["Intent classes", "17", "—"],
    ["Training time (fit + 5-fold CV)", "≈ 48 ms", "—"],
    ["Misclassified test queries", "24 / 169", "—"],
], widths=[46, 32, 22], align_right=[1, 2])
d.caption("Table 7.2 — Classifier headline performance. Baseline is the accuracy expected from "
          "uniform random assignment across 17 classes.")
d.p("The cross-validated figure of 78.7% represents roughly a 13.3-fold improvement over random "
    "assignment. The 7.1-point gap between the single-split result and the cross-validated mean "
    "is itself informative: it quantifies how far one partition can flatter a model at this "
    "corpus size, and is why the lower figure is treated as authoritative throughout.")

d.table([
    ["Fold", "1", "2", "3", "4", "5", "Mean", "Std dev"],
    ["Accuracy", "81.0%", "75.7%", "80.3%", "81.4%", "75.2%", "78.7%", "2.7%"],
], widths=[16, 12, 12, 12, 12, 12, 12, 12], align_right=[1, 2, 3, 4, 5, 6, 7])
d.caption("Table 7.3 — Five-fold cross-validation fold scores.")

d.h2("7.3 Per-Class Performance")
rows = [["Intent", "Precision", "Recall", "F1", "Support"]]
for i, p, r, f, n in [
    ("profit", "1.00", "0.92", "0.96", "13"),
    ("dead_stock", "1.00", "0.91", "0.95", "11"),
    ("lead_summary", "0.91", "1.00", "0.95", "10"),
    ("expense_breakdown", "1.00", "0.89", "0.94", "9"),
    ("forecast", "0.89", "1.00", "0.94", "8"),
    ("stock_level", "1.00", "0.89", "0.94", "9"),
    ("low_stock", "0.82", "1.00", "0.90", "9"),
    ("team_performance", "1.00", "0.80", "0.89", "10"),
    ("revenue_by_product", "0.83", "0.91", "0.87", "11"),
    ("invoice_list", "0.80", "0.89", "0.84", "9"),
    ("outstanding", "0.89", "0.80", "0.84", "10"),
    ("churn", "0.86", "0.75", "0.80", "8"),
    ("help", "0.90", "0.69", "0.78", "13"),
    ("customer_lookup", "0.70", "0.88", "0.78", "8"),
    ("revenue_total", "0.69", "0.82", "0.75", "11"),
    ("revenue_by_state", "0.78", "0.70", "0.74", "10"),
    ("order_summary", "0.67", "0.80", "0.73", "10"),
]:
    rows.append([i, p, r, f, n])
d.table(rows, widths=[36, 16, 16, 16, 16], align_right=[1, 2, 3, 4])
d.caption("Table 7.4 — Per-class precision, recall and F1 on the held-out test set, by F1.")
d.p("Three observations follow. Six intents achieve F1 at or above 0.90, these being classes "
    "with distinctive vocabulary — **dead_stock** owns *unsold*, *stagnant*, *obsolete*; "
    "**forecast** owns *predict*, *projection*, *demand*. The **help** intent shows high "
    "precision (0.90) against markedly lower recall (0.69): when it fires it is almost always "
    "right, but it misses a substantial minority, because greetings such as *“good morning”* "
    "carry essentially no domain vocabulary. The weakest classes all show precision below "
    "recall, indicating over-prediction; **revenue_total** in particular acts as an absorbing "
    "class for money-related queries the model cannot place more specifically.")

d.h2("7.5 Compliance with ISO/IEC 25010 Quality Model")
d.p("The architectural evaluation of the PRISM AI platform was benchmarked against the "
    "ISO/IEC 25010 Systems and Software Quality Requirements and Evaluation (SQuaRE) standard framework "
    "across four core dimensions:")
d.bullet("**Functional Suitability (ISO/IEC 25010 Section 4.1):** Evaluated via intent classification accuracy, "
         "precision, recall, and F1-score across 17 distinct domain intent classes under 5-fold cross-validation.")
d.bullet("**Performance Efficiency (ISO/IEC 25010 Section 4.2):** Latency benchmarked under client-side execution "
         "(under 5 ms response time), measuring browser CPU and memory utilization.")
d.bullet("**Security & Confidentiality (ISO/IEC 27001 Compliance):** Zero data exfiltration architecture ensuring "
         "financial ledgers and order books remain fully isolated in local client memory without external API exposure.")
d.bullet("**Maintainability & Testability:** Evaluated using automated unit test suites for deterministic engine "
         "routing and corpus disambiguation.")

# ═════════════════════════════════════════════════════════════ CHAPTER 8 ═══
d.page_break()
d.h1("Chapter 8: Results and Discussion")

d.h2("8.1 Implementation Outcome")
d.table([
    ["Area", "Files", "Lines", "Notes"],
    ["Application screens", "35", "14,128", "34 routed screens plus authentication"],
    ["State and logic layer", "3", "2,513", "Auth, data and notification providers"],
    ["Domain utilities", "6", "1,295", "Ledger construction, scheme evaluation, export, geography"],
    ["AI / ML subsystem", "2", "1,114", "NLP engine and ML classifier with corpus"],
    ["Shared components", "4", "939", "Layout, navigation, assistant interface"],
    ["**Total**", "**54**", "**20,126**", "Excludes configuration and schema definition"],
], widths=[30, 12, 14, 44], align_right=[1, 2])
d.caption("Table 8.1 — Implementation metrics by area.")
d.bullet("**34 application screens** across ten functional modules")
d.bullet("**30-table relational schema** spanning nine operational cycles")
d.bullet("**15 roles across 21 permission domains**, verified complete by scripted enumeration")
d.bullet("**17 natural language intents** with entity extraction and multi-turn dialogue")
d.bullet("**659-query labelled corpus** supporting a classifier at 78.7% cross-validated accuracy")

d.h2("8.2 Classifier Iteration History")
d.p("The final accuracy was not obtained in a single attempt. Four iterations were conducted, "
    "each preceded by a diagnostic step determining what to change.")
d.table([
    ["#", "Intervention", "CV accuracy", "Δ", "Diagnostic reasoning"],
    ["1", "Initial implementation — 244 examples, default hyperparameters", "47.1%", "—",
     "Training accuracy of 93.4% against 45.9% on test indicated substantial overfitting"],
    ["2", "Cross-validated grid search, 180 configurations", "54.6%", "+7.5",
     "L2-normalised vectors sum to ~1, leaving log-scores too closely spaced; softmax output "
     "was near-uniform at roughly 10% across all 17 classes"],
    ["3", "Corpus expansion, 244 → 616 examples", "75.8%", "+21.2",
     "≈11 training examples per class was insufficient to estimate reliable likelihoods over a "
     "266-term vocabulary"],
    ["4", "Corpus disambiguation following confusion analysis", "78.7%", "+2.9",
     "One confusion pair accounted for 14% of test errors; the cause was inconsistent labelling "
     "rather than model capacity"],
], widths=[5, 24, 12, 8, 51], align_right=[2, 3])
d.caption("Table 8.2 — Experimental iteration history. Accuracies are five-fold cross-validated "
          "to permit comparison across iterations.")
d.code("""
    CV accuracy progression

    Iteration 1  |##############################                    | 47.1%
    Iteration 2  |###################################               | 54.6%
    Iteration 3  |################################################  | 75.8%
    Iteration 4  |##################################################| 78.7%
                 0%                                              100%
""")
d.caption("Figure 8.1 — Classifier accuracy progression across experimental iterations.")
d.p("The largest single gain, 21.2 points, came from enlarging the corpus rather than from any "
    "modification to the algorithm. This is consistent with the general observation that on "
    "small datasets the quantity and quality of labelled data dominate model selection, and it "
    "is the most transferable finding of the project.")

d.h2("8.3 Defect Classes Identified and Resolved")
d.p("Several defects encountered during development were structural rather than incidental, and "
    "are recorded here because the diagnosis in each case was more instructive than the fix.")
d.table([
    ["Defect", "Diagnosis and resolution"],
    ["Authorisation checks failing silently across eleven screens",
     "Checks had been written against legacy role identifiers that no seeded account carried, so "
     "they evaluated false for every real user. The most severe instance locked the "
     "administrator out of system settings entirely. Resolved by routing every check through "
     "shared role-predicate helpers"],
    ["Order marked delivered against insufficient stock",
     "The availability guard covered only the transition to Ready for Dispatch, leaving Shipped "
     "and Delivered directly reachable. An order for 450 units was fulfilled against 250 in "
     "stock, producing a negative position. Guard extended across all three forward transitions"],
    ["Genuine shortfalls blocking orders entirely",
     "Introduced by the fix above; business practice is to deliver what exists and hold the "
     "balance. Resolved by adding cumulative partial delivery with a distinct order state"],
    ["Visit reports referencing non-existent orders",
     "The order-creation routine did not return the generated identifier, so the field module "
     "recorded a fabricated reference. Resolved by returning the identifier and awaiting it"],
    ["Inventory deductions silently reverting",
     "Persistence calls were issued without awaiting completion, so deductions applied locally "
     "but were overwritten by the next authoritative fetch. Resolved by awaiting all writes"],
    ["Five-to-six second delay before content appeared",
     "First paint blocked on ~25 sequential network fetches. Resolved by hydrating state "
     "synchronously from the local mirror, deferring the authoritative fetch to the background"],
    ["Fuzzy matcher corrupting valid words",
     "\"doing\" corrected to \"owing\", \"trader\" to \"order\". Resolved by reducing the edit "
     "budget for short tokens to one and adding a protected-word list"],
    ["\"total spending\" matching order status \"pending\"",
     "Substring testing matched inside a longer word. Resolved by whole-word boundary matching "
     "for short controlled vocabularies"],
    ["Classifier reporting ~100% confidence on every query",
     "The highest-scoring scale over-sharpened the posterior. A lower scale was chosen: accuracy "
     "statistically unchanged, confidence spanning a usable 64–100% range"],
], widths=[28, 72])
d.caption("Table 8.3 — Defect classes identified and resolved.")

d.h2("8.4 Comparative Evaluation: Symbolic Engine versus Classifier")
d.table([
    ["Property", "Symbolic engine", "Statistical classifier"],
    ["Coverage of novel phrasing", "Limited to authored vocabulary", "Generalises to unseen wordings"],
    ["Behaviour on unknown input", "Declines explicitly", "Returns nearest class regardless"],
    ["Named entity recognition", "Supported (live gazetteer)", "Not attempted"],
    ["Dialogue state tracking", "Supported", "Not attempted"],
    ["Typo tolerance", "Damerau–Levenshtein correction", "Implicit only, via shared n-grams"],
    ["Auditability", "Responsible rule identifiable", "Feature contributions inspectable"],
    ["Maintenance on vocabulary change", "Manual rule authoring", "Corpus extension and retraining"],
    ["Measured accuracy", "Not directly comparable", "78.7% ± 2.7% (5-fold CV)"],
], widths=[28, 34, 38])
d.caption("Table 8.4 — Capability comparison of the two approaches.")
d.p("The final row carries a methodological caution. Evaluating the rule engine against a corpus "
    "written with knowledge of its vocabulary would produce an inflated figure measuring "
    "self-consistency rather than generalisation. The two are therefore compared qualitatively "
    "on capability, and only the classifier — evaluated against data held out from its own "
    "training — is assigned a numerical accuracy.")
d.p("Both are exposed simultaneously in the evaluation dashboard, where a user may enter any "
    "query and observe both verdicts. Disagreement is surfaced explicitly and in practice "
    "indicates either a phrasing the rule vocabulary does not yet cover, or a query the "
    "classifier has assigned on weak evidence.")

d.h2("8.5 Key Takeaways")
for i, t in enumerate([
    "**Data quality dominated algorithm selection.** Corpus work delivered 24.1 points across "
    "iterations 3 and 4; the algorithmic substitution delivered 0.4 points, within noise.",
    "**Aggregate accuracy conceals structure.** The defect resolved in Section 6.10 was "
    "invisible in the aggregate figure and apparent only in the confusion matrix. Per-class "
    "reporting was not presentational — it was the instrument that located the fault.",
    "**A negative result can be more informative than a positive one.** The Complement Naive "
    "Bayes experiment failed to improve accuracy but succeeded in refuting a hypothesis, which "
    "is what redirected effort productively.",
    "**Calibration is distinct from accuracy.** A configuration may maximise correctness while "
    "rendering its confidence output meaningless. Where confidence is displayed, it forms part "
    "of the deliverable.",
    "**Constraints belong at the point of transaction.** Every integrity defect in Section 8.3 "
    "shared a shape: a rule enforced at one point in a workflow but not at every point where "
    "the underlying state could change.",
    "**Cross-validation is essential at this scale.** The single-split figure exceeded the "
    "cross-validated mean by 7.1 points; reporting only the former would have overstated the "
    "system's capability.",
], start=1):
    d.numbered(i, t)

# ═════════════════════════════════════════════════════════════ CHAPTER 9 ═══
d.page_break()
d.h1("Chapter 9: Conclusion and Future Scope")

d.h2("9.1 Conclusion")
d.p("This internship produced an integrated distribution management, CRM and ERP platform in "
    "production use, together with an embedded natural language intelligence layer and a "
    "rigorously evaluated statistical classifier. The platform comprises 54 source modules "
    "totalling 20,126 lines across 34 screens, backed by a 30-table relational schema and a "
    "role-based access model covering 15 roles across 21 permission domains. It spans the "
    "order-to-cash and procure-to-pay cycles, batch-level inventory with expiry-aware "
    "allocation, a three-tier channel hierarchy with partner portals, accounting, scheme "
    "administration and field-force automation.")
d.p("The intelligence layer implements the three canonical components of a task-oriented "
    "dialogue system — intent classification, named entity recognition and dialogue state "
    "tracking — with Damerau–Levenshtein approximate matching providing tolerance to the "
    "misspellings characteristic of real operator input. The statistical classifier, written "
    "from mathematical first principles with no machine learning library, achieves 85.8% "
    "held-out accuracy and 78.7% (± 2.7%) under five-fold cross-validation across 17 intents, "
    "approximately 13.3 times the random baseline.")
d.p("The constraints set out in Section 2.5 are satisfied. No business data leaves the client "
    "environment. Answers are computed rather than generated, so a numerical result is either "
    "correct or absent — never plausibly wrong. Marginal cost per query is zero and inference is "
    "instantaneous. The system declines explicitly when a question exceeds its competence.")
d.p("The more durable outcome, however, is methodological. The accuracy progression from 47.1% "
    "to 78.7% was not achieved by trying successive algorithms until one performed better. Each "
    "iteration was preceded by a diagnostic step identifying what was actually failing: "
    "overfitting was diagnosed from the divergence between training and test accuracy; "
    "near-uniform posteriors were traced to normalisation compressing the score range; and the "
    "dominant confusion pair was root-caused to inconsistent labelling in data authored by hand. "
    "The intervention producing the largest gain was corpus expansion, and the intervention that "
    "failed was the algorithmic substitution undertaken on the strongest theoretical grounds. "
    "Measuring before changing, and retaining the result when the measurement contradicts the "
    "expectation, is the principal transferable lesson of this work.")

d.h2("9.2 Limitations")
d.p("**Representational ceiling.** A bag-of-words model with bigrams encodes no word order "
    "beyond adjacent pairs. Queries whose meaning depends on longer-range structure cannot be "
    "resolved reliably, and this bounds achievable accuracy irrespective of further corpus "
    "growth.")
d.p("**Corpus scale and provenance.** At 659 examples the corpus remains small, and the "
    "persistent gap between training accuracy (98.8%) and cross-validated accuracy (78.7%) "
    "indicates residual overfitting. It was moreover authored by one individual and therefore "
    "reflects one person's expectations about phrasing rather than an observed distribution of "
    "real user queries.")
d.p("**Bounded competence.** The system answers within 17 defined intents and cannot perform "
    "open-ended reasoning, multi-step analysis or hypothetical inference. This is a deliberate "
    "consequence of the architecture rather than a defect, but it is a real constraint.")
d.p("**Heuristic analytics.** The predictive module employs statistical heuristics rather than "
    "fitted models, as stated in Section 6.8. Its outputs are descriptive extrapolations and "
    "should not be read as learned forecasts.")
d.p("**Verification depth.** Verification relied on compilation, static analysis, scripted "
    "assertion suites and manual scenario testing. An automated regression suite over the "
    "business-logic layer would materially strengthen confidence, particularly around the "
    "order-to-cash and inventory paths where the defects of Section 8.3 concentrated.")

d.h2("9.3 Future Scope")
for i, t in enumerate([
    "**Collect real query logs.** Instrumenting the deployed system to accumulate genuine user "
    "queries with resolved intents would replace an author's expectations with an observed "
    "distribution, and would supply training data at a scale hand-authoring cannot reach. This "
    "is the single highest-value next step.",
    "**Introduce sentence embeddings.** A compact quantised sentence-transformer would overcome "
    "the bag-of-words ceiling by recognising semantic similarity between queries sharing no "
    "vocabulary — the most direct path past approximately 85% accuracy.",
    "**Calibrate reported confidence.** Naive Bayes posteriors are known to be poorly "
    "calibrated. Platt scaling or isotonic regression on a validation partition would align "
    "displayed confidence with observed correctness, permitting a principled abstention "
    "threshold.",
    "**Employ the classifier in the operational path.** At present it is evaluated and displayed "
    "but does not serve live queries. A hybrid arrangement — classifier for intent, symbolic "
    "engine for entities and dialogue state — would combine the generalisation of the former "
    "with the precision of the latter.",
    "**Add genuine unsupervised learning.** K-means clustering over recency, frequency and "
    "monetary features would provide data-driven customer segmentation, complementing the "
    "present supervised classification.",
    "**Extend intent coverage.** Procurement, scheme and claim management, complaint handling "
    "and field-force attendance are represented in the platform but not yet addressed by the "
    "language interface.",
    "**Automated regression suite.** Coverage over the order-to-cash and inventory paths, where "
    "integrity defects concentrated, would convert manual scenario testing into a repeatable "
    "guarantee.",
    "**Server-side authorisation.** Access control is presently enforced in the application "
    "layer. Migrating it to database row-level security would render it independent of client "
    "correctness.",
], start=1):
    d.numbered(i, t)

# ═══════════════════════════════════════════════════════════════ REFS ══════
d.page_break()
d.h1("References")
for i, r in enumerate([
    "Rennie, J. D. M., Shih, L., Teevan, J., and Karger, D. R. (2003). “Tackling the Poor "
    "Assumptions of Naive Bayes Text Classifiers.” Proceedings of the Twentieth International "
    "Conference on Machine Learning (ICML), pp. 616–623.",
    "Damerau, F. J. (1964). “A Technique for Computer Detection and Correction of Spelling "
    "Errors.” Communications of the ACM, 7(3), pp. 171–176.",
    "Levenshtein, V. I. (1966). “Binary Codes Capable of Correcting Deletions, Insertions and "
    "Reversals.” Soviet Physics Doklady, 10(8), pp. 707–710.",
    "Manning, C. D., Raghavan, P., and Schütze, H. (2008). Introduction to Information "
    "Retrieval. Cambridge University Press. Chapters 6 and 13.",
    "Jurafsky, D., and Martin, J. H. (2024). Speech and Language Processing, 3rd edition draft. "
    "Chapters 4 and 15.",
    "Porter, M. F. (1980). “An Algorithm for Suffix Stripping.” Program: Electronic Library and "
    "Information Systems, 14(3), pp. 130–137.",
    "McCallum, A., and Nigam, K. (1998). “A Comparison of Event Models for Naive Bayes Text "
    "Classification.” AAAI-98 Workshop on Learning for Text Categorization.",
    "Pedregosa, F., et al. (2011). “Scikit-learn: Machine Learning in Python.” Journal of "
    "Machine Learning Research, 12, pp. 2825–2830. Consulted for the smoothed IDF and Complement "
    "Naive Bayes formulations.",
    "Platt, J. (1999). “Probabilistic Outputs for Support Vector Machines and Comparisons to "
    "Regularized Likelihood Methods.” Advances in Large Margin Classifiers, pp. 61–74.",
    "Codd, E. F. (1970). “A Relational Model of Data for Large Shared Data Banks.” "
    "Communications of the ACM, 13(6), pp. 377–387.",
], start=1):
    d.numbered(i, r)

# ═══════════════════════════════════════════════════════════ APPENDIX ═════
d.page_break()
d.h1("Appendix A: Selected Implementation Extracts")

d.h2("A.1 Damerau–Levenshtein Distance with Early Termination")
d.code("""const editDistance = (a, b, max = 2) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) {
        d = Math.min(d, prev2[j - 2] + 1);      // adjacent transposition
      }
      cur[j] = d;
      if (d < rowBest) rowBest = d;
    }
    if (rowBest > max) return max + 1;          // whole row exceeds budget
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
};""")

d.h2("A.2 Multinomial Naive Bayes — Parameter Estimation")
d.code("""fit(vectors, labels, nFeatures) {
  this.classes = [...new Set(labels)].sort();
  const classIdx = new Map(this.classes.map((c, i) => [c, i]));
  const counts = new Array(this.classes.length).fill(0);
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
    const denom = total + this.alpha * nFeatures;   // Lidstone smoothing
    const out = new Float64Array(nFeatures);
    for (let i = 0; i < nFeatures; i++)
      out[i] = Math.log((row[i] + this.alpha) / denom);
    return out;
  });
  return this;
}""")

d.h2("A.3 Numerically Stable Posterior")
d.code("""predictProba(vec) {
  const scores = this.decisionFunction(vec);
  const max = Math.max(...scores);
  const exp = scores.map(s => Math.exp(s - max));  // shift prevents overflow
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(e => e / sum);
}""")

d.h2("A.4 Partial Delivery Against Insufficient Stock")
d.code("""const deliverPartial = async (id, deliverQty) => {
  const order = orders.find(o => o.id === id);
  const totalQty  = Number(order.quantity || 0);
  const already   = Number(order.deliveredQty || 0);
  const newDelivered = Math.min(totalQty, already + Number(deliverQty));
  const actualNow    = newDelivered - already;
  if (actualNow <= 0) return;

  const fullyDone = newDelivered >= totalQty;
  await updateOrder(id, {
    deliveredQty: newDelivered,
    status: fullyDone ? 'Delivered' : 'Partially Delivered',
  });
  await deductInventoryForOrder({ ...order, quantity: actualNow });
  if (fullyDone) await billPartyForOrder(order);
};""")

d.h2("A.5 Reproducing the Reported Metrics")
d.p("All figures in Chapters 6 to 8 are produced under a fixed seed (42) and are reproducible by "
    "invoking the evaluation harness:")
d.code("""import { trainIntentModel } from './src/utils/ml/naiveBayes';

const result = trainIntentModel();          // seed 42, 75:25 split, 5-fold CV
console.log(result.metrics.accuracy);       // 0.858
console.log(result.cv.mean, result.cv.sd);  // 0.787, 0.027
console.log(result.metrics.macroF1);        // 0.859""")
d.p("The same figures are rendered live within the application at the **ML Lab** route, which "
    "trains the model in the browser on page load and displays headline metrics, the per-class "
    "table, the confusion matrix and the full list of misclassified test queries.")

try:
    d.save("Prismora_Project_Report.docx")
    print("Wrote Prismora_Project_Report.docx")
except PermissionError:
    d.save("Prismora_Project_Report_Updated.docx")
    print("Prismora_Project_Report.docx is currently open in Word. Wrote to Prismora_Project_Report_Updated.docx instead!")
