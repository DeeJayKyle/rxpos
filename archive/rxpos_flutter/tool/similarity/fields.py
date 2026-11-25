# Which record fields React writes per table (put(d,'T',{...}), upsert('T',{...}), CrudPage fields) vs. which field
# names appear anywhere in the Flutter code as string literals. Prints, per table, React fields Flutter never mentions.
import re, os, sys, json, collections
root = sys.argv[1]
def files(d, exts):
    for dp, _, fs in os.walk(d):
        if 'node_modules' in dp: continue
        for f in fs:
            if f.endswith(exts): yield os.path.join(dp, f)
def obj_keys(src, i):
    # src[i] == '{' : top-level keys of the object literal
    depth, keys, j, n = 0, [], i, len(src)
    tok = re.compile(r"\s*(\.\.\.)?([A-Za-z_$][\w$]*)\s*(:|,|\}|\()")
    while j < n:
        c = src[j]
        if c in '{[(':
            depth += 1
            if depth == 1 and c == '{':
                m = tok.match(src, j + 1)
                if m and not m.group(1): keys.append(m.group(2))
        elif c in '}])':
            depth -= 1
            if depth == 0: return keys, j
        elif c == ',' and depth == 1:
            m = tok.match(src, j + 1)
            if m and not m.group(1): keys.append(m.group(2))
        elif c in '\'"`':
            q = c; j += 1
            while j < n and src[j] != q:
                if src[j] == '\\': j += 1
                j += 1
        j += 1
    return keys, j
react = collections.defaultdict(set)
for f in files(os.path.join(root, 'src'), ('.js', '.jsx')):
    s = open(f).read()
    for m in re.finditer(r"(?:put\(\s*\w+\s*,|upsert\()\s*'(\w+)'\s*,\s*\{", s):
        ks, _ = obj_keys(s, m.end() - 1)
        react[m.group(1)].update(ks)
    for m in re.finditer(r'table="(\w+)"', s):
        blk = s[m.end(): m.end() + 6000]
        fm = re.search(r"fields=\{\[", blk)
        if fm:
            end = blk.find(']}', fm.end())
            react[m.group(1)].update(re.findall(r"key:\s*'(\w+)'", blk[fm.end(): end]))
        bm = re.search(r"blank=\{\{", blk)
        if bm and bm.start() < 400:
            react[m.group(1)].update(obj_keys(blk, bm.end() - 1)[0])
flutter = set()
for f in files(os.path.join(root, 'rxpos_flutter', 'lib'), ('.dart',)):
    flutter.update(re.findall(r"'(\w+)'", open(f).read()))
ignore = {'id', 'updatedAt'}
out = {}
for t in sorted(react):
    miss = sorted(k for k in react[t] - ignore if k not in flutter)
    out[t] = {'react': len(react[t] - ignore), 'missing': miss}
print(json.dumps(out, indent=1))
