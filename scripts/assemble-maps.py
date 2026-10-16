from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1];layout=json.loads((ROOT/'doc/world-layout.json').read_text());W,H=1440,1088
Image.new('RGBA',(16,16)).save(ROOT/'public/map/empty.png')
metadata={}
def save_layer(scene,layer,im):
 box=im.getbbox()
 if not box:
  metadata[scene+'-'+layer]={'x':0,'y':0,'width':1,'height':1,'empty':True}
  Image.new('RGBA',(1,1)).save(ROOT/'public/map'/f'{scene}-{layer}.png');return
 x,y,right,bottom=box;im=im.crop(box)
 metadata[scene+'-'+layer]={'x':x,'y':y,'width':right-x,'height':bottom-y,'empty':False}
 im.save(ROOT/'public/map'/f'{scene}-{layer}.png')

def material_file(name):return ROOT/'public/art'/('floor-grass-v3.png' if name=='grass' else 'floor-'+name+'.png')

wall=Image.open(ROOT/'public/art/wall-north.png').convert('RGBA');wall=wall.resize((round(wall.width*64/wall.height),64),Image.Resampling.NEAREST)
for id,r in layout['rooms'].items():
 b=r['interior'];x,y,w,h=[b[k] for k in ['x','y','w','h']]
 tile=Image.open(ROOT/'public/art'/('floor-stone.png' if r['outdoor'] else 'floor-wood.png')).convert('RGBA').resize((160,160),Image.Resampling.NEAREST)
 floor=Image.new('RGBA',(W,H));inside=Image.new('RGBA',(w,h))
 if r['outdoor']:
  material=layout.get('outdoors',{}).get(id,{}).get('patches',[{'material':'grass'}])[0]['material']
  edge=Image.open(material_file(material)).convert('RGBA').resize((160,160),Image.Resampling.NEAREST)
  for ey in range(0,H,160):
   for ex in range(0,W,160):floor.alpha_composite(edge,(ex,ey))
 for ty in range(0,h,160):
  for tx in range(0,w,160):inside.alpha_composite(tile,(tx,ty))
 floor.alpha_composite(inside,(x,y))
 if id in layout.get('outdoors',{}):
  for patch in layout['outdoors'][id]['patches']:
   source=Image.open(material_file(patch['material'])).convert('RGBA').resize((160,160),Image.Resampling.NEAREST)
   area=Image.new('RGBA',(patch['w'],patch['h']))
   # All patches share the world's tile phase, including intersections.
   for py in range(-(patch['y']%160),area.height,160):
    for px in range(-(patch['x']%160),area.width,160):area.alpha_composite(source,(px,py))
   floor.alpha_composite(area,(patch['x'],patch['y']))
 if id=='harbor':
  rope=json.loads((ROOT/'src/world/pier-rope-layout.json').read_text())
  atlas=Image.open(ROOT/'public/art'/rope['atlas']).convert('RGBA')
  for piece in rope['pieces']:
   sx,sy,sw,sh=rope['roles'][piece['role']]
   cell=atlas.crop((sx,sy,sx+sw,sy+sh))
   if 'cropX' in piece:
    cell=cell.crop((piece['cropX'],0,piece['cropX']+piece['width'],sh))
   floor.alpha_composite(cell,(piece['x'],piece['y']+rope['displayYOffset']))
 # Independent floor textiles sit below every character/furniture sprite. They
 # remain separate source assets and never invent collision or cover walking feet.
 for p in r['props']:
  if not p.get('floorDecoration'):continue
  decor=Image.open(ROOT/'public/art'/f"{p['art']}.png").convert('RGBA')
  dw=round(p['width']);dh=round(decor.height*dw/decor.width)
  decor=decor.resize((dw,dh),Image.Resampling.NEAREST)
  floor.alpha_composite(decor,(round(p['at']['x']-dw/2),round(p['at']['y']-dh)))
 save_layer(id,'base',floor)
 north=Image.new('RGBA',(W,H));side=Image.new('RGBA',(W,H));south=Image.new('RGBA',(W,H))
 if not r['outdoor']:
  row=Image.new('RGBA',(w,64))
  for tx in range(0,w,wall.width):row.alpha_composite(wall,(tx,0))
  north.alpha_composite(row,(x,y-64))
  cap=wall.crop((0,0,wall.width,8)).rotate(90,expand=True)
  for sy in range(y-64,y+h,cap.height):
   side.alpha_composite(cap,(x-8,sy));side.alpha_composite(cap,(x+w,sy))
  # Front wall with explicit 48-unit door gap. Base feet end at floor end.
  door=layout['doorways'][id];doorx=door['center'];half=door['width']//2;left=doorx-half-(x-8);right=(x+w+8)-(doorx+half)
  south.alpha_composite(row.crop((0,0,min(left,row.width),64)),(x-8,y+h-56))
  south.alpha_composite(row.crop((0,0,right,64)),(doorx+half,y+h-56))
   # Frame and exposed wall ends come from the same generated wall material.
  stile=wall.crop((12,0,16,64))
  south.alpha_composite(stile,(doorx-half-4,y+h-56))
  south.alpha_composite(stile,(doorx+half,y+h-56))
  lintel=wall.crop((0,0,door['width']+8,4))
  south.alpha_composite(lintel,(doorx-half-4,y+h-59))
 save_layer(id,'north',north);save_layer(id,'side',side);save_layer(id,'front',south)

(ROOT/'src/world/map-dimensions.json').write_text(json.dumps(metadata,indent=2))
