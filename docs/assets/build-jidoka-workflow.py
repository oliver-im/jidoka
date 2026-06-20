#!/usr/bin/env python3
"""Build the jidoka 'Solution' workflow diagram (light+dark) as one flat PNG pair.

One image, two panes joined by an "each unit" arrow:
  left  — the plan dir as a directory TREE (root marked configurable, plan dir marked
          example), unit files tagged with the reviewable-unit-row motif
  right — one unit's gate, vertical: Unit 0N -> review -> approve -> reset -> next unit

Self-contained: embeds brand webfonts (Inter + Space Grotesk) as base64 so headless
Chrome has no font-load race. HTML is scratch and not kept in-repo.
"""
import base64, pathlib, re, subprocess, urllib.request

WORK = pathlib.Path('/tmp/jidoka-workflow')
WORK.mkdir(parents=True, exist_ok=True)
OUT = pathlib.Path(__file__).resolve().parent

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
CSS_URL = ('https://fonts.googleapis.com/css2?'
           'family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap')

W, H = 1100, 506


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    return urllib.request.urlopen(req, timeout=40).read()


def font_face_css():
    cache = WORK / 'fonts.css'
    if cache.exists():
        return cache.read_text()
    css = fetch(CSS_URL, {'User-Agent': UA}).decode()
    faces = []
    for m in re.finditer(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})', css):
        subset, block = m.group(1), m.group(2)
        if subset != 'latin':
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        wght = re.search(r"font-weight:\s*(\d+)", block).group(1)
        url = re.search(r"url\(([^)]+)\)\s*format\('woff2'\)", block).group(1)
        b64 = base64.b64encode(fetch(url)).decode()
        faces.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%s;"
            "font-display:block;src:url(data:font/woff2;base64,%s) format('woff2')}"
            % (fam, wght, b64))
    out = '\n'.join(faces)
    cache.write_text(out)
    return out


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#F7F3EA;--ink:#1F2528;--muted:#6A7376;--faint:#98A09F;
  --line:#E3DDD1;--tree:#C9CFC6;--arrow:#BCC1B8;--block:#C7CDC8;--track:#EEE8DC;
  --card:#FFFFFF;--accent:#C94B3D;--green:#3E7C59;--blue:#4B6F88;
  --shadow:0 1px 0 rgba(31,37,40,.03),0 16px 36px -26px rgba(31,37,40,.5);
}
html.dark{
  --bg:#16191B;--ink:#F2EFE6;--muted:#9AA3A2;--faint:#6C7574;
  --line:#2C3337;--tree:#3A434A;--arrow:#586268;--block:#39424A;--track:#20262A;
  --card:#1E2326;--accent:#D6584A;--green:#5FA079;--blue:#76A2C0;
  --shadow:0 1px 0 rgba(0,0,0,.20),0 20px 42px -28px rgba(0,0,0,.75);
}
html,body{background:var(--bg)}
body{font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:var(--ink)}
.slide{width:__W__px;height:__H__px;background:var(--bg);padding:38px 48px 52px;display:flex;flex-direction:column}
.urow{display:inline-block;vertical-align:middle}

.cols{display:flex;align-items:stretch;width:100%;position:relative}

/* left: capture note, sits under the title and above the tree */
.capnote{margin-top:14px;font-size:12.5px;line-height:1.55;color:var(--muted);
  max-width:360px;border-left:2px solid var(--line);padding-left:13px}
.capnote .flabel{display:block;font-family:'Space Grotesk';font-size:10.5px;
  font-weight:600;letter-spacing:.15em;color:var(--faint);margin-bottom:5px}
.capnote .k{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;
  color:var(--ink);background:var(--track);border:1px solid var(--line);
  border-radius:5px;padding:1px 6px}
.capnote b{color:var(--ink);font-weight:600}
.col{display:flex;flex-direction:column;flex:0 0 50%;max-width:50%;min-width:0}
.col.lft{padding-right:104px}
.col.rgt{padding-left:104px}
.ptitle{font-family:'Space Grotesk';font-weight:600;font-size:21px;
  line-height:1.18;letter-spacing:-.01em;color:var(--ink);max-width:376px}
.psub{font-size:13.5px;line-height:1.45;color:var(--muted);margin-top:13px;max-width:376px}
.psub b{color:var(--ink);font-weight:600}
.phead{min-height:92px}
.psub.lead{margin-top:13px}

/* center connector — floats on the 50/50 seam, out of flow */
.connect{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:176px;display:flex;flex-direction:column;align-items:center;gap:9px;z-index:2}
.clabel{font-size:12.5px;font-weight:600;letter-spacing:.03em;color:var(--muted);white-space:nowrap}

/* left: directory tree (CSS-drawn connectors) */
.tree{margin-top:22px;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:14.5px}
.trow{display:flex;align-items:center;line-height:2.0}
.troot{color:var(--muted);font-weight:600}
.elbow{color:var(--tree)}
.tdir{color:var(--ink);font-weight:600}
.children{margin-left:14px}
.child{position:relative;padding-left:26px;line-height:2.0}
.child::before{content:'';position:absolute;left:0;top:0;width:1.6px;height:100%;background:var(--tree)}
.child:last-child::before{height:1em}
.child::after{content:'';position:absolute;left:0;top:1em;width:16px;height:1.6px;background:var(--tree)}
.clabel{display:inline-flex;align-items:center}
.tfile{color:var(--muted)}
.tunit{color:var(--ink)}
.tmore-d{color:var(--faint);letter-spacing:.12em}
.child .urow{margin-left:11px}
.tcom{color:var(--faint);font-size:12px;margin-left:12px;font-style:italic}
.tlegend{margin-top:24px;font-size:12px;color:var(--faint);display:flex;align-items:center;gap:9px}

/* right: vertical gate */
.gatev{margin-top:30px;display:flex;flex-direction:column;align-items:flex-start}
.grow{display:flex;align-items:center;gap:15px}
.gpill{width:160px;justify-content:center;display:inline-flex;align-items:center;
  gap:8px;border-radius:12px;padding:10px 14px;font-size:15.5px;font-weight:600;
  white-space:nowrap;border:1px solid transparent}
.gpill .ic{width:17px;height:17px}
.gpill.unit{background:var(--card);border-color:var(--line);color:var(--ink);box-shadow:var(--shadow)}
.gpill.review{background:rgba(201,75,61,.12);color:var(--accent)}
html.dark .gpill.review{background:rgba(214,88,74,.17)}
.gpill.ok{background:rgba(62,124,89,.13);color:var(--green)}
html.dark .gpill.ok{background:rgba(95,160,121,.17)}
.gpill.reset{background:rgba(75,111,136,.12);color:var(--blue)}
html.dark .gpill.reset{background:rgba(118,162,192,.17)}
.gpill.next{background:var(--bg);border-color:var(--line);border-style:dashed;color:var(--muted)}
.gcap{font-size:12.5px;line-height:1.25;color:var(--faint);max-width:188px}
.gdown{width:160px;display:flex;justify-content:center;padding:7px 0}
"""


def urow(scale=1.0, lit=2):
    rects = []
    for i, x in enumerate([0, 9, 18, 27]):
        fill = 'var(--accent)' if i == lit else 'var(--block)'
        rects.append('<rect x="%d" y="2" width="6" height="12" rx="2" fill="%s"/>' % (x, fill))
    return ('<svg class="urow" width="%g" height="%g" viewBox="0 0 33 16">%s</svg>'
            % (33 * scale, 16 * scale, ''.join(rects)))


PAUSE = ('<svg class="ic" viewBox="0 0 24 24" fill="none">'
         '<rect x="8" y="6" width="3.2" height="12" rx="1.4" fill="currentColor"/>'
         '<rect x="13" y="6" width="3.2" height="12" rx="1.4" fill="currentColor"/></svg>')
CHECK = ('<svg class="ic" viewBox="0 0 24 24" fill="none">'
         '<path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.6" '
         'stroke-linecap="round" stroke-linejoin="round"/></svg>')
RESET = ('<svg class="ic" viewBox="0 0 24 24" fill="none">'
         '<path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" stroke="currentColor" '
         'stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>')
DOWN = ('<svg width="16" height="34" viewBox="0 0 16 34" fill="none">'
        '<line x1="8" y1="0" x2="8" y2="25" stroke="var(--arrow)" stroke-width="2" stroke-linecap="round"/>'
        '<path d="M3 23 L8 29 L13 23" stroke="var(--arrow)" stroke-width="2" fill="none" '
        'stroke-linecap="round" stroke-linejoin="round"/></svg>')
RIGHT = ('<svg width="62" height="18" viewBox="0 0 62 18" fill="none">'
         '<line x1="0" y1="9" x2="52" y2="9" stroke="var(--arrow)" stroke-width="2" stroke-linecap="round"/>'
         '<path d="M50 4 L58 9 L50 14" stroke="var(--arrow)" stroke-width="2" fill="none" '
         'stroke-linecap="round" stroke-linejoin="round"/></svg>')


def tree():
    def child(name, cls, unit=False, lit=2, com=''):
        u = urow(0.9, lit) if unit else ''
        c = '<span class="tcom">%s</span>' % com if com else ''
        return ('<div class="child"><span class="clabel"><span class="%s">%s</span>%s</span>%s</div>'
                % (cls, name, u, c))
    more = ('<div class="child"><span class="clabel">'
            '<span class="tmore-d">&hellip;</span></span><span class="tcom">up to N units</span></div>')
    files = (
        child('overview.md', 'tfile', com='plan summary')
        + child('progress.md', 'tfile', com='live status')
        + child('01-data-model.md', 'tunit', unit=True, lit=0)
        + child('02-renderer.md', 'tunit', unit=True, lit=1)
        + child('03-hook-wiring.md', 'tunit', unit=True, lit=2)
        + more
    )
    return ("""
<div class="tree">
  <div class="trow"><span class="troot">docs/exec-plans/active/</span><span class="tcom">configurable root</span></div>
  <div class="children">
    <div class="child"><span class="clabel"><span class="tdir">260619-1-feature/</span></span><span class="tcom">an example plan</span>
      <div class="children">__FILES__</div>
    </div>
  </div>
  <div class="tlegend">__GLYPH__&nbsp; a reviewable unit &middot; one gate each</div>
</div>
""".replace('__FILES__', files).replace('__GLYPH__', urow(0.82)))


def gate():
    def grow(cls, icon, label, cap):
        return ('<div class="grow"><span class="gpill %s">%s%s</span>'
                '<span class="gcap">%s</span></div>') % (cls, icon, label, cap)
    down = '<div class="gdown">%s</div>' % DOWN
    return (
        grow('unit', urow(0.95) + '&nbsp;', 'a unit', 'reviewable, executable, testable units') + down
        + grow('review', PAUSE, 'review', 'use other agents or models for review') + down
        + grow('ok', CHECK, 'approve', 'see the overview, findings to steer the direction if needed') + down
        + grow('reset', RESET, 'reset', 'optionally compact or clear before the next execution')
    )


def body():
    return """
<div class="slide">
  <div class="cols">
    <div class="col lft">
      <div class="phead">
        <div class="ptitle">Split the plan</div>
        <div class="psub lead">The native plan output, split into <b>reviewable units</b> + overview &amp; progress</div>
      </div>
      <div class="capnote">
        a <b>PreToolUse</b> hook on <span class="k">ExitPlanMode</span> intercepts the native plan and
        materializes the dir below &mdash; automatically, before you approve.
      </div>
      __TREE__
    </div>
    <div class="connect">
      <div class="clabel">each unit</div>
      __RIGHT__
    </div>
    <div class="col rgt">
      <div class="phead">
        <div class="ptitle">A gate after every unit</div>
        <div class="psub">Stop, review, approve, then optionally reset context before the next execution begins</div>
      </div>
      __GATE__
    </div>
  </div>
</div>
""".replace('__TREE__', tree()).replace('__GATE__', gate()).replace('__RIGHT__', RIGHT)


def html(theme):
    css = CSS.replace('__W__', str(W)).replace('__H__', str(H))
    cls = 'dark' if theme == 'dark' else ''
    doc = ("<!doctype html><html class='%s'><head><meta charset='utf-8'><style>%s\n%s</style></head>"
           "<body>%s</body></html>")
    return doc % (cls, FONT_CSS, css, body())


FONT_CSS = font_face_css()

for theme in ('light', 'dark'):
    p = WORK / ('workflow-%s.html' % theme)
    p.write_text(html(theme))
    png = OUT / ('jidoka-workflow-%s.png' % theme)
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=2',
        '--window-size=%d,%d' % (W, H),
        '--screenshot=%s' % png,
        '--virtual-time-budget=2500',
        p.as_uri(),
    ], check=True, capture_output=True)
    print('rendered', png)

print('done')
