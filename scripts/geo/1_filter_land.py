import json
d=json.load(open('gm/package/map.geo.json'))
def bb(ring):
  xs=[p[0] for p in ring]; ys=[p[1] for p in ring]
  return min(xs),min(ys),max(xs),max(ys)
def inter(b,c): return not (b[2]<c[0] or b[0]>c[2] or b[3]<c[1] or b[1]>c[3])
NA=(-170,5,-45,75); EAST=(-82.5,24.3,-69.5,42.6)
na=[]; east=[]
for g in d['geometries']:
  polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
  for p in polys:
    b=bb(p[0])
    if inter(b,NA): na.append(p)
    if inter(b,EAST): east.append(p)
print(len(na),len(east), sum(len(p[0]) for p in na), sum(len(p[0]) for p in east))
json.dump({'type':'Feature','properties':{},'geometry':{'type':'MultiPolygon','coordinates':na}},open('out/na.geojson','w'))
json.dump({'type':'Feature','properties':{},'geometry':{'type':'MultiPolygon','coordinates':east}},open('out/east.geojson','w'))
