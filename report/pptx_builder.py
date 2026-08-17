"""
Minimal Office Open XML (.pptx) writer.

python-pptx is unavailable here (no network access for pip), so the package is
assembled directly: a .pptx is a ZIP archive of XML parts. Content scripts
import `build(slides, out_path)` and supply only the slide data.

Slide data is a list of (title, subtitle, lines). Within `lines`:
    "# text"  bold mini-heading
    "* text"  bullet
    "> text"  indented sub-point
    ""        vertical spacer
    other     plain paragraph
Slide 1 is rendered as a centred title slide.
"""

import zipfile
from xml.sax.saxutils import escape

# 16:9 in English Metric Units (1 inch = 914,400 EMU)
SLIDE_W, SLIDE_H = 12192000, 6858000

ACCENT = "1F6FEB"   # headline blue
DARK = "0D1117"     # near-black body text
MUTED = "57606A"    # secondary text


def text_run(txt, size, bold=False, color=DARK, italic=False):
    return (
        f'<a:r><a:rPr lang="en-IN" sz="{size}" b="{1 if bold else 0}" '
        f'i="{1 if italic else 0}" dirty="0">'
        f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
        f'<a:latin typeface="Calibri"/></a:rPr>'
        f'<a:t>{escape(txt)}</a:t></a:r>'
    )


def body_paragraph(line):
    if line == "":
        return '<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr></a:p>'
    if line.startswith("# "):
        return ('<a:p><a:pPr marL="0" indent="0"><a:buNone/>'
                '<a:spcBef><a:spcPts val="500"/></a:spcBef></a:pPr>'
                + text_run(line[2:], 1250, bold=True, color=ACCENT) + '</a:p>')
    if line.startswith("* "):
        return ('<a:p><a:pPr marL="285750" indent="-285750">'
                '<a:spcBef><a:spcPts val="240"/></a:spcBef>'
                f'<a:buClr><a:srgbClr val="{ACCENT}"/></a:buClr>'
                '<a:buChar char="•"/></a:pPr>'
                + text_run(line[2:], 1200) + '</a:p>')
    if line.startswith("> "):
        return ('<a:p><a:pPr marL="571500" indent="-228600">'
                f'<a:buClr><a:srgbClr val="{MUTED}"/></a:buClr>'
                '<a:buChar char="–"/></a:pPr>'
                + text_run(line[2:], 1100, color=MUTED) + '</a:p>')
    return ('<a:p><a:pPr marL="0" indent="0"><a:buNone/>'
            '<a:spcBef><a:spcPts val="240"/></a:spcBef></a:pPr>'
            + text_run(line, 1200) + '</a:p>')


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
    if n == 1:
        shapes.append(rect(2, 0, 0, SLIDE_W, 118000, ACCENT))
        shapes.append(shape(3, "Title", 914400, 1150000, SLIDE_W - 1828800, 900000,
                            '<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>'
                            + text_run(title, 5000, bold=True, color=ACCENT) + '</a:p>'))
        shapes.append(shape(4, "Subtitle", 914400, 2050000, SLIDE_W - 1828800, 760000,
                            '<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>'
                            + text_run(subtitle, 1500, color=MUTED, italic=True) + '</a:p>'))
        body = "".join(
            ('<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr>'
             + (text_run(l[2:], 1250, bold=True, color=ACCENT) if l.startswith("# ")
                else text_run(l, 1300))
             + '</a:p>') if l else '<a:p><a:pPr><a:buNone/></a:pPr></a:p>'
            for l in lines)
        shapes.append(shape(5, "Body", 914400, 2880000, SLIDE_W - 1828800, 3400000, body))
    else:
        shapes.append(rect(2, 685800, 640000, 260000, 62000, ACCENT))
        shapes.append(shape(3, "Title", 685800, 300000, SLIDE_W - 1371600, 560000,
                            '<a:p><a:pPr><a:buNone/></a:pPr>'
                            + text_run(title, 2800, bold=True, color=ACCENT) + '</a:p>'))
        top = 760000
        if subtitle:
            shapes.append(shape(4, "Subtitle", 685800, 745000, SLIDE_W - 1371600, 340000,
                                '<a:p><a:pPr><a:buNone/></a:pPr>'
                                + text_run(subtitle, 1250, color=MUTED, italic=True) + '</a:p>'))
            top = 1120000
        shapes.append(shape(5, "Body", 685800, top, SLIDE_W - 1371600,
                            SLIDE_H - top - 460000,
                            "".join(body_paragraph(l) for l in lines)))
        shapes.append(shape(6, "PageNo", SLIDE_W - 1200000, SLIDE_H - 420000, 700000, 260000,
                            '<a:p><a:pPr algn="r"><a:buNone/></a:pPr>'
                            + text_run(str(n), 1000, color=MUTED) + '</a:p>'))

    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'
            '<a:effectLst/></p:bgPr></p:bg>'
            '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/>'
            '</p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
            '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            + "".join(shapes) +
            '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" '
            'bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
            'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" '
            'folHlink="folHlink"/></p:clrMapOvr></p:sld>')


EMPTY_TREE = ('<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/>'
              '<p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/>'
              '<a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/>'
              '</a:xfrm></p:grpSpPr></p:spTree></p:cSld>')

CLR_MAP = ('<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" '
           'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" '
           'accent6="accent6" hlink="hlink" folHlink="folHlink"/>')

SLIDE_MASTER = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
                + EMPTY_TREE + CLR_MAP +
                '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/>'
                '</p:sldLayoutIdLst></p:sldMaster>')

SLIDE_MASTER_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                     '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
                     '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
                     '</Relationships>')

SLIDE_LAYOUT = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                'type="blank" preserve="1">'
                + EMPTY_TREE + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')

SLIDE_LAYOUT_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                     '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
                     '</Relationships>')

FILL_STYLES = ('<a:fillStyleLst>'
               + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' * 3
               + '</a:fillStyleLst><a:lnStyleLst>'
               + "".join(f'<a:ln w="{w}"><a:solidFill><a:schemeClr val="phClr"/>'
                         f'</a:solidFill></a:ln>' for w in (6350, 12700, 19050))
               + '</a:lnStyleLst><a:effectStyleLst>'
               + '<a:effectStyle><a:effectLst/></a:effectStyle>' * 3
               + '</a:effectStyleLst><a:bgFillStyleLst>'
               + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' * 3
               + '</a:bgFillStyleLst>')


def _clr_scheme():
    accents = [ACCENT, "2DA44E", "BC4C00", "8250DF", "0969DA", "CF222E"]
    s = ('<a:clrScheme name="PRISM">'
         '<a:dk1><a:srgbClr val="0D1117"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>'
         '<a:dk2><a:srgbClr val="57606A"/></a:dk2><a:lt2><a:srgbClr val="F6F8FA"/></a:lt2>')
    for i, c in enumerate(accents, start=1):
        s += f'<a:accent{i}><a:srgbClr val="{c}"/></a:accent{i}>'
    return s + ('<a:hlink><a:srgbClr val="0969DA"/></a:hlink>'
                '<a:folHlink><a:srgbClr val="8250DF"/></a:folHlink></a:clrScheme>')


THEME = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PRISM">'
         '<a:themeElements>' + _clr_scheme() +
         '<a:fontScheme name="PRISM">'
         '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
         '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>'
         '</a:fontScheme><a:fmtScheme name="PRISM">' + FILL_STYLES + '</a:fmtScheme>'
         '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>')


def build(slides, out_path, title="Presentation"):
    n = len(slides)

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        + "".join(f'<Override PartName="/ppt/slides/slide{i}.xml" '
                  f'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
                  for i in range(1, n + 1))
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>')

    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
                 '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
                 '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
                 '</Relationships>')

    presentation = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                    '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">'
                    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
                    '<p:sldIdLst>'
                    + "".join(f'<p:sldId id="{255 + i}" r:id="rId{i + 1}"/>' for i in range(1, n + 1))
                    + '</p:sldIdLst>'
                    f'<p:sldSz cx="{SLIDE_W}" cy="{SLIDE_H}"/>'
                    '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>')

    presentation_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                         '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                         '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
                         + "".join(f'<Relationship Id="rId{i + 1}" '
                                   f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" '
                                   f'Target="slides/slide{i}.xml"/>' for i in range(1, n + 1))
                         + f'<Relationship Id="rId{n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'
                         '</Relationships>')

    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{escape(title)}</dc:title><cp:revision>1</cp:revision></cp:coreProperties>')

    app = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
           f'<Slides>{n}</Slides><Application>Microsoft Office PowerPoint</Application></Properties>')

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("docProps/core.xml", core)
        z.writestr("docProps/app.xml", app)
        z.writestr("ppt/presentation.xml", presentation)
        z.writestr("ppt/_rels/presentation.xml.rels", presentation_rels)
        z.writestr("ppt/slideMasters/slideMaster1.xml", SLIDE_MASTER)
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", SLIDE_MASTER_RELS)
        z.writestr("ppt/slideLayouts/slideLayout1.xml", SLIDE_LAYOUT)
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", SLIDE_LAYOUT_RELS)
        z.writestr("ppt/theme/theme1.xml", THEME)
        for i, (t, sub, lines) in enumerate(slides, start=1):
            z.writestr(f"ppt/slides/slide{i}.xml", build_slide(i, t, sub, lines))
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels",
                       '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                       '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                       '<Relationship Id="rId1" '
                       'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" '
                       'Target="../slideLayouts/slideLayout1.xml"/></Relationships>')

    print(f"Wrote {out_path} with {n} slides")
