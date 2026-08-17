"""
Builds a standalone Table of Contents page matching the numbering/dotted-
leader style of the reference report (numbered front-matter items with
roman-numeral pages, chapters continuing the same sequence, sub-topics listed
unindexed under Chapter 2), populated with the real chapter list from
Prismora_Project_Report.docx.

Page numbers are left as blanks ("___"): real pagination is only known once
the document is opened and typeset in Word, and inventing numbers here would
be a guess presented as fact. Fill them in after final formatting — Word
shows the live page number for the cursor position in the status bar.
"""

from docx_builder import Docx

d = Docx()
BLANK = "___"

d.h1("Table of Contents")
d.spacer(1)

d.toc_entry("1.  CERTIFICATES", "")
d.toc_entry("1.1.  Completion Certificate", "I", indent=360, size=20)
d.toc_entry("1.2.  Student Declaration", "II", indent=360, size=20)
d.toc_entry("1.3.  Certificate from Mentor", "III", indent=360, size=20)
d.toc_entry("1.4.  Certificate of Plagiarism Check from Library", "IV", indent=360, size=20)

d.toc_entry("2.  List of Tables", "V")
d.toc_entry("3.  List of Figures", "VI")
d.toc_entry("4.  List of Abbreviations", "VII")
d.toc_entry("5.  Acknowledgements", "VIII")
d.toc_entry("6.  Abstract", "1")

d.toc_entry("7.  Chapter 1: Introduction", BLANK)

d.toc_entry("8.  Chapter 2: Literature Review and Problem Statement", BLANK)
d.toc_subline("Enterprise Systems in Distribution")
d.toc_subline("Task-Oriented Dialogue Systems")
d.toc_subline("Approaches to Intent Recognition")
d.toc_subline("Rationale for Replacing the Hosted Model")
d.toc_subline("Problem Statement")

d.toc_entry("9.  Chapter 3: System Analysis and Requirements", BLANK)
d.toc_entry("10.  Chapter 4: System Design and Architecture", BLANK)
d.toc_entry("11.  Chapter 5: Module Implementation", BLANK)
d.toc_entry("12.  Chapter 6: The AI Intelligence Layer", BLANK)
d.toc_entry("13.  Chapter 7: Testing and Validation", BLANK)
d.toc_entry("14.  Chapter 8: Results and Discussion", BLANK)
d.toc_entry("15.  Chapter 9: Conclusion and Future Scope", BLANK)
d.toc_entry("16.  References", BLANK)
d.toc_entry("17.  APPENDICES", BLANK)

d.spacer(2)
d.p("Note: page numbers marked ___ depend on final pagination once the "
    "document is formatted in Word and should be filled in last. The roman "
    "numerals (I–VIII) assume each front-matter item occupies a single page; "
    "adjust if any section runs longer.")

d.save("Table_of_Contents.docx")
print("Wrote Table_of_Contents.docx")
