# packs the imported house model + PBR textures into vendor/assets.js (embedded so WebGL can use them from file://)
import base64, json, glob, os
o='/home/claude/assets/out'
meta=json.load(open(f'{o}/house.json')); binb=base64.b64encode(open(f'{o}/house.bin','rb').read()).decode()
u=lambda p:'data:image/jpeg;base64,'+base64.b64encode(open(p,'rb').read()).decode()
tex={os.path.basename(f)[:-4]:u(f) for f in glob.glob(f'{o}/house/*.jpg')}
snow={k:u(f'{o}/snow_{k}.jpg') for k in ['diff','nor','rough']}
photo=u(f'{o}/okul_photo.jpg')
js=f"window.OKUL_PHOTO='{photo}';window.HOUSE_META={json.dumps(meta)};window.HOUSE_BIN='{binb}';window.HOUSE_TEX={json.dumps(tex)};window.SNOW_TEX={json.dumps(snow)};"
open('vendor/assets.js','w').write(js); print(len(js)//1024,'KB')
