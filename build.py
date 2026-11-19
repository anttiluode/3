"""Bundle inspectable modules into a single, file://-friendly HTML page.
Run: python build.py. No dependencies beyond Python.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
html = (ROOT / 'template.html').read_text(encoding='utf-8')
js = ''.join((ROOT / name).read_text(encoding='utf-8') + '\n' for name in ('engine.mjs', 'render.mjs', 'app.mjs'))
js = js.replace("import {N,GreedySplats,compose,bandEnergy,toFloat,toPixels,clamp} from './engine.mjs';", '')
js = js.replace("import {OpticalView} from './render.mjs';", '')
js = js.replace('export const', 'const').replace('export function', 'function').replace('export class', 'class')
needle = '<script type="module" src="app.mjs"></script>'
if html.count(needle) != 1:
    raise RuntimeError('Expected one app script tag in template.html')
(ROOT / 'index.html').write_text(html.replace(needle, '<script>' + js + '</script>'), encoding='utf-8')
print('Built index.html')
