# React CrudPage form fields per table vs. FormFieldSpec keys in the Flutter files that write that table.
import re, os, sys, json
root = sys.argv[1]
react = {}
for dp, _, fs in os.walk(os.path.join(root, 'src')):
    for f in fs:
        if not f.endswith('.jsx'): continue
        s = open(os.path.join(dp, f)).read()
        for m in re.finditer(r'table="(\w+)"', s):
            blk = s[m.end(): m.end() + 6000]
            fm = re.search(r"fields=\{\[", blk)
            if not fm: continue
            end = blk.find(']}', fm.end())
            react.setdefault(m.group(1), []).extend(k for k in re.findall(r"key:\s*'(\w+)'", blk[fm.end(): end]))
fl = {}
for dp, _, fs in os.walk(os.path.join(root, 'rxpos_flutter', 'lib')):
    for f in fs:
        if not f.endswith('.dart'): continue
        s = open(os.path.join(dp, f)).read()
        specs = set(re.findall(r"FormFieldSpec\('(\w+)'", s))
        for t in react:
            if re.search(r"\.put\('%s'" % t, s) or re.search(r"'%s'" % t, s) and specs:
                fl.setdefault(t, set()).update(specs)
out = {}
for t, ks in react.items():
    ks = list(dict.fromkeys(ks))
    have = fl.get(t, set())
    out[t] = {'react': ks, 'missing': [k for k in ks if k not in have]}
print(json.dumps(out, indent=1))
