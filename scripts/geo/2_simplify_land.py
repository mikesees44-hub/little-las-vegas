import json, math, sys
G='/home/claude/little-las-vegas/public/geo/'
def area_km2(r):
  lat=sum(p[1] for p in r)/len(r); k=111.32**2*math.cos(math.radians(lat))
  a=0
  for i in range(len(r)-1): a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1]
  return abs(a)/2*k
def dp(pts, tol):
  n=len(pts)
  if n<5: return pts
  keep=[False]*n; keep[0]=keep[-1]=True
  stack=[(0,n-1)]
  t2=tol*tol
  while stack:
    a,b=stack.pop()
    ax,ay=pts[a]; bx,by=pts[b]; dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
    md=-1; mi=-1
    for i in range(a+1,b):
      px,py=pts[i]
      if L==0: d=(px-ax)**2+(py-ay)**2
      else:
        t=((px-ax)*dx+(py-ay)*dy)/L; t=max(0,min(1,t))
        d=(px-ax-t*dx)**2+(py-ay-t*dy)**2
      if d>md: md=d; mi=i
    if md>t2:
      keep[mi]=True; stack.append((a,mi)); stack.append((mi,b))
  return [p for p,k in zip(pts,keep) if k]
def clip(ring, box):
  x0,y0,x1,y1=box
  def edge(pts, inside, inter):
    out=[]
    for i in range(len(pts)):
      cur=pts[i]; prev=pts[i-1]
      if inside(cur):
        if not inside(prev): out.append(inter(prev,cur))
        out.append(cur)
      elif inside(prev): out.append(inter(prev,cur))
    return out
  def ix(x):
    return lambda p,q: [x, p[1]+(q[1]-p[1])*(x-p[0])/(q[0]-p[0])]
  def iy(y):
    return lambda p,q: [p[0]+(q[0]-p[0])*(y-p[1])/(q[1]-p[1]), y]
  pts=ring[:-1]
  for inside,inter in [(lambda p:p[0]>=x0, ix(x0)),(lambda p:p[0]<=x1, ix(x1)),(lambda p:p[1]>=y0, iy(y0)),(lambda p:p[1]<=y1, iy(y1))]:
    if not pts: break
    pts=edge(pts,inside,inter)
  if len(pts)<3: return None
  return pts+[pts[0]]
def run(src, out, tol, minarea, box, digits):
  g=json.load(open(src))['geometry']['coordinates']
  polys=[]; npts=0
  for p in g:
    outer=p[0]
    if area_km2(outer)<minarea: continue
    rings=[]
    for j,r in enumerate(p):
      if j>0 and area_km2(r)<minarea: continue
      if box:
        xs=[q[0] for q in r]; ys=[q[1] for q in r]
        if min(xs)<box[0] or max(xs)>box[2] or min(ys)<box[1] or max(ys)>box[3]:
          r=clip(r,box)
          if not r: 
            if j==0: break
            continue
      s=dp(r,tol)
      if len(s)<4:
        if j==0: break
        continue
      rings.append([[round(x,digits),round(y,digits)] for x,y in s])
    if rings: polys.append(rings); npts+=sum(len(r) for r in rings)
  json.dump({'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'MultiPolygon','coordinates':polys}}]},open(G+out,'w'),separators=(',',':'))
  print(out,len(polys),npts)
which=sys.argv[1]
if which=='na': run('out/na.geojson','land-na.json',0.02,30,None,3)
else: run('out/east.geojson','land-east.json',0.0005,0.05,(-82.5,24.3,-69.5,42.6),4)
if which=='shore': run('out/east.geojson','land-shore.json',0.00012,0.005,(-75.65,38.7,-73.85,40.65),5)
