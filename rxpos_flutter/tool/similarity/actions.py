# Buttons / labelled controls per React page vs. the strings in the Flutter code (normalised).
import re, os, sys, json
root = sys.argv[1]
def norm(t): return re.sub(r'[^a-z0-9 ]', '', re.sub(r'\s+', ' ', t.lower().replace('&amp;', '&'))).strip()
fl = set()
for dp, _, fs in os.walk(os.path.join(root, 'rxpos_flutter', 'lib')):
    for f in fs:
        if f.endswith('.dart'):
            s = open(os.path.join(dp, f)).read()
            for m in re.finditer(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", s):
                fl.add(norm(re.sub(r'\$\{[^}]*\}|\$\w+', ' ', m.group(1) or m.group(2) or '')))
flat = ' | '.join(fl)
def skip_braces(s, i):
    d = 0
    while i < len(s):
        if s[i] == '{': d += 1
        elif s[i] == '}':
            d -= 1
            if d == 0: return i + 1
        elif s[i] in '\'"`':
            q = s[i]; i += 1
            while i < len(s) and s[i] != q:
                if s[i] == '\\': i += 1
                i += 1
        i += 1
    return i
def strip_expr(t):
    out, i = '', 0
    while i < len(t):
        if t[i] == '{':
            j = skip_braces(t, i)
            inner = t[i + 1: j - 1]
            # keep literal strings inside {cond ? 'A' : 'B'}
            out += ' ' + ' '.join(x[1:-1] for x in re.findall(r"'[^']{3,}'", inner)) + ' '
            i = j
        else:
            out += t[i]; i += 1
    return re.sub(r'<[^>]*>', ' ', out)
def buttons(s):
    res = []
    for m in re.finditer(r'<button\b', s):
        i, attrs = m.end(), ''
        while i < len(s) and s[i] != '>':
            if s[i] == '{':
                j = skip_braces(s, i); i = j; attrs += ' {} '; continue
            attrs += s[i]; i += 1
        if i < len(s) and s[i - 1] == '/': continue
        end = s.find('</button>', i)
        body = s[i + 1: end] if end > 0 else ''
        res.append((attrs, body))
    return res
pages = {}
files = [os.path.join('pages', f) for f in sorted(os.listdir(os.path.join(root, 'src', 'pages')))] + ['App.jsx', 'calls.jsx', 'notify.jsx', 'engage.jsx', 'ui.jsx']
for f in files:
    p = os.path.join(root, 'src', f)
    if not p.endswith('.jsx'): continue
    s = open(p).read()
    labels = set()
    for attrs, body in buttons(s):
        t = re.sub(r'\s+', ' ', strip_expr(body)).strip()
        a = re.findall(r'(?:title|aria-label)="([^"]+)"', attrs)
        if len(norm(t)) > 2: labels.add(t)
        elif a: labels.add(a[0])
    miss = sorted(l for l in labels if norm(l) not in flat)
    pages[os.path.basename(f)] = {'n': len(labels), 'missing': miss}
print(json.dumps(pages, indent=1))
