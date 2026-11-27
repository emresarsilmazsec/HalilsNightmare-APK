import sys, os, base64
out = sys.argv[1] if len(sys.argv) > 1 else 'dist/index.html'
app = len(sys.argv) > 2 and sys.argv[2] == 'app'
three = open('vendor/three.min.js').read()
js = '\n'.join(open(f'src/{f}.js').read() for f in ['story','audio','world','monster','main'])
gltf = open('vendor/gltfloader.js').read()
assets = open('vendor/assets.js').read()
face = 'window.CREATURE_GLB="data:model/gltf-binary;base64,' + base64.b64encode(open('vendor/creature.glb','rb').read()).decode() + '";'
scripts = f"<script>{three}</script>\n<script>{gltf}</script>\n<script>{assets}</script>\n<script>{face}{'window.IS_APP=true;' if app else ''}</script>\n<script>(function(){{'use strict';\n{js}\n}})();</script>"
html = open('src/shell.html').read().replace('<!--SCRIPTS-->', scripts)
os.makedirs(os.path.dirname(out) or '.', exist_ok=True); open(out,'w').write(html); print(out, len(html)//1024, 'KB')
