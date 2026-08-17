"""
Minimal Office Open XML (.docx) writer.

python-docx is unavailable here (no network for pip), so the package is
assembled directly: a .docx is a ZIP of XML parts. This module emits the parts
Word requires and exposes a small block-level API — headings, justified body
text, bullets, bordered tables, monospaced code and page breaks — which is the
full set the project reports need.

Usage:
    doc = Docx()
    doc.h1("Chapter 1: Introduction")
    doc.p("Body text ...")
    doc.table([["Header", "Header"], ["cell", "cell"]], widths=[40, 60])
    doc.save("out.docx")
"""

import zipfile
from xml.sax.saxutils import escape

# Twips: 1 inch = 1440. A4 portrait with 1" margins.
PAGE_W, PAGE_H = 11906, 16838
MARGIN = 1440

ACCENT = "1F4E79"   # heading blue
BODY = "000000"
MUTED = "595959"


def _esc(t):
    return escape(str(t))


class Docx:
    def __init__(self):
        self.body = []

    # ── inline helpers ──────────────────────────────────────────────────────
    @staticmethod
    def _run(text, *, size=22, bold=False, italic=False, color=BODY,
             font="Times New Roman", underline=False):
        """size is in half-points: 22 = 11pt."""
        rpr = f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:cs="{font}"/>'
        if bold:
            rpr += '<w:b/>'
        if italic:
            rpr += '<w:i/>'
        if underline:
            rpr += '<w:u w:val="single"/>'
        rpr += f'<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
        return (f'<w:r><w:rPr>{rpr}</w:rPr>'
                f'<w:t xml:space="preserve">{_esc(text)}</w:t></w:r>')

    @classmethod
    def _rich(cls, text, **kw):
        """Render **bold** spans inside a plain string.

        An incoming `bold` (table headers, for instance) applies to every run;
        the ** markers add emphasis on top of it rather than fighting it.
        """
        base_bold = kw.pop("bold", False)
        out, parts = [], text.split("**")
        for i, part in enumerate(parts):
            if part:
                out.append(cls._run(part, bold=base_bold or (i % 2 == 1), **kw))
        return "".join(out)

    # ── block elements ──────────────────────────────────────────────────────
    def _para(self, content, *, align="both", space_before=0, space_after=120,
              indent=0, hanging=0, keep_next=False, line=276, border_bottom=False,
              shade=None):
        ppr = '<w:pPr>'
        if shade:
            ppr += f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>'
        if border_bottom:
            ppr += ('<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" '
                    f'w:color="{ACCENT}"/></w:pBdr>')
        if indent or hanging:
            ppr += f'<w:ind w:left="{indent}" w:hanging="{hanging}"/>'
        ppr += (f'<w:spacing w:before="{space_before}" w:after="{space_after}" '
                f'w:line="{line}" w:lineRule="auto"/>')
        ppr += f'<w:jc w:val="{align}"/>'
        if keep_next:
            ppr += '<w:keepNext/>'
        ppr += '</w:pPr>'
        self.body.append(f'<w:p>{ppr}{content}</w:p>')

    def title(self, text, size=56):
        self._para(self._run(text, size=size, bold=True, color=ACCENT),
                   align="center", space_before=240, space_after=120)

    def subtitle(self, text, size=26, italic=True):
        self._para(self._run(text, size=size, italic=italic, color=MUTED),
                   align="center", space_after=120)

    def center(self, text, size=24, bold=False):
        self._para(self._run(text, size=size, bold=bold), align="center", space_after=100)

    def h1(self, text):
        self._para(self._run(text, size=32, bold=True, color=ACCENT),
                   align="left", space_before=360, space_after=180,
                   keep_next=True, border_bottom=True)

    def h2(self, text):
        self._para(self._run(text, size=26, bold=True, color=ACCENT),
                   align="left", space_before=280, space_after=120, keep_next=True)

    def h3(self, text):
        self._para(self._run(text, size=23, bold=True, italic=True),
                   align="left", space_before=200, space_after=100, keep_next=True)

    def p(self, text):
        self._para(self._rich(text))

    def bullet(self, text, level=0):
        indent = 360 + level * 360
        self._para(self._run("•  ") + self._rich(text),
                   indent=indent, hanging=360, space_after=80)

    def numbered(self, n, text):
        self._para(self._run(f"{n}.  ", bold=True) + self._rich(text),
                   indent=480, hanging=480, space_after=80)

    def caption(self, text):
        self._para(self._run(text, size=19, italic=True, color=MUTED),
                   align="center", space_after=240)

    def code(self, text):
        for line in text.split("\n"):
            self._para(self._run(line or " ", size=17, font="Consolas"),
                       align="left", space_after=0, line=240, indent=180,
                       shade="F2F2F2")
        self._para("", space_after=140)

    def spacer(self, n=1):
        for _ in range(n):
            self._para("", space_after=0)

    def page_break(self):
        self.body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    def toc_entry(self, label, page, *, indent=0, bold=False, size=22):
        """One Table-of-Contents line: label, a real dotted tab leader, then a
        right-aligned page number — the same mechanism Word's own contents
        pages use, not typed periods, so the dots stay perfectly aligned
        regardless of label length or font substitution."""
        tab_pos = (PAGE_W - 2 * MARGIN) - indent
        run = self._run(label, size=size, bold=bold) + '<w:r><w:tab/></w:r>' + \
            self._run(str(page), size=size, bold=bold)
        self._para(run, align="left", indent=indent, space_after=100, line=264)
        # tabs must be injected into the paragraph just written
        self.body[-1] = self.body[-1].replace(
            '<w:pPr>',
            f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{tab_pos}"/></w:tabs>',
            1,
        )

    def toc_subline(self, text, *, indent=540, size=22, italic=False):
        """An unindexed sub-topic line under a TOC entry — no leader, no page
        number, matching the plain indented style used for chapter subtopics."""
        self._para(self._run(text, size=size, italic=italic, color=MUTED),
                   indent=indent, space_after=40, line=264)

    def table(self, rows, widths=None, header=True, align_right=None, font_size=19):
        """rows: list of lists. widths: list of percentages summing to 100."""
        n = len(rows[0])
        widths = widths or [round(100 / n)] * n
        align_right = align_right or []

        xml = ['<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>'
               '<w:tblBorders>'
               + "".join(f'<w:{e} w:val="single" w:sz="6" w:space="0" w:color="808080"/>'
                         for e in ("top", "left", "bottom", "right", "insideH", "insideV"))
               + '</w:tblBorders>'
               '<w:tblCellMar>'
               '<w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
               '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>'
               '</w:tblCellMar></w:tblPr><w:tblGrid>'
               + "".join(f'<w:gridCol w:w="{int(w * 94)}"/>' for w in widths)
               + '</w:tblGrid>']

        for r, row in enumerate(rows):
            is_head = header and r == 0
            xml.append('<w:tr>')
            if is_head:
                xml.append('<w:trPr><w:tblHeader/></w:trPr>')
            for c, cell in enumerate(row):
                shade = 'D9E2F3' if is_head else None
                tcpr = f'<w:tcPr><w:tcW w:w="{int(widths[c] * 94)}" w:type="dxa"/>'
                if shade:
                    tcpr += f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>'
                tcpr += '<w:vAlign w:val="top"/></w:tcPr>'
                jc = "right" if (c in align_right and not is_head) else "left"
                para = (f'<w:p><w:pPr><w:spacing w:before="20" w:after="20" '
                        f'w:line="240" w:lineRule="auto"/><w:jc w:val="{jc}"/></w:pPr>'
                        + self._rich(str(cell), size=font_size, bold=is_head) + '</w:p>')
                xml.append(f'<w:tc>{tcpr}{para}</w:tc>')
            xml.append('</w:tr>')
        xml.append('</w:tbl>')
        self.body.append("".join(xml))
        self._para("", space_after=100)

    # ── package assembly ────────────────────────────────────────────────────
    def _document(self):
        sect = (f'<w:sectPr><w:pgSz w:w="{PAGE_W}" w:h="{PAGE_H}"/>'
                f'<w:pgMar w:top="{MARGIN}" w:right="{MARGIN}" w:bottom="{MARGIN}" '
                f'w:left="{MARGIN}" w:header="720" w:footer="720" w:gutter="0"/>'
                '</w:sectPr>')
        return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:body>' + "".join(self.body) + sect + '</w:body></w:document>')

    @staticmethod
    def _styles():
        return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:docDefaults><w:rPrDefault><w:rPr>'
                '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>'
                '<w:sz w:val="22"/></w:rPr></w:rPrDefault>'
                '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" '
                'w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
                '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
                '<w:name w:val="Normal"/><w:qFormat/></w:style>'
                '</w:styles>')

    def save(self, path):
        ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
              '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
              '<Default Extension="xml" ContentType="application/xml"/>'
              '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
              '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
              '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
              '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
              '</Types>')
        rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
                '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
                '</Relationships>')
        drels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                 '</Relationships>')
        core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
                'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
                'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
                '<dc:title>Prismora - Project Report</dc:title><cp:revision>1</cp:revision>'
                '</cp:coreProperties>')
        app = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
               '<Application>Microsoft Office Word</Application></Properties>')

        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", ct)
            z.writestr("_rels/.rels", rels)
            z.writestr("word/document.xml", self._document())
            z.writestr("word/_rels/document.xml.rels", drels)
            z.writestr("word/styles.xml", self._styles())
            z.writestr("docProps/core.xml", core)
            z.writestr("docProps/app.xml", app)
