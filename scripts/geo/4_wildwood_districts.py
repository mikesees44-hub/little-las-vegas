import json, math
ring=json.load(open('island.json'))
LAT0=38.98; KX=111.32*math.cos(math.radians(LAT0)); KY=111.32
def to(p): return ((p[0]+74.8)*KX, (p[1]-LAT0)*KY)
def back(q): return [round(q[0]/KX-74.8,5), round(q[1]/KY+LAT0,5)]
R=[to(p) for p in ring]
S=to((-74.846,38.951)); N=to((-74.7895,39.0062))
L=math.hypot(N[0]-S[0],N[1]-S[1]); ax=((N[0]-S[0])/L,(N[1]-S[1])/L)
perp=(-ax[1],ax[0])  # left of axis = toward NW (bay)
def pt(u,v): return (S[0]+ax[0]*u+perp[0]*v, S[1]+ax[1]*u+perp[1]*v)
def coast(u):
  # intersections of line through pt(u,0) along perp with ring
  ox,oy=pt(u,0); ts=[]
  for i in range(len(R)-1):
    x1,y1=R[i]; x2,y2=R[i+1]
    ex,ey=x2-x1,y2-y1
    den=perp[0]*ey-perp[1]*ex
    if abs(den)<1e-12: continue
    t=((x1-ox)*ey-(y1-oy)*ex)/den
    s=((x1-ox)*perp[1]-(y1-oy)*perp[0])/den
    if 0<=s<=1: ts.append(t)
  ts.sort()
  if not ts: return None
  # most oceanward entry: smallest t (ocean side is negative v = SE)
  return ts[0], (ts[1] if len(ts)>1 else ts[0]+1.5)
print('length km',L)
def band(u0,u1,a,b,steps=10,width=1.25):
  left=[];right=[]
  for k in range(steps+1):
    u=u0+(u1-u0)*k/steps
    c=coast(u)
    if not c: continue
    v0,v1=c; v1=min(v1,v0+width)
    va=v0+a*(v1-v0); vb=v0+b*(v1-v0)
    right.append(pt(u,va)); left.append(pt(u,vb))
  poly=right+left[::-1]
  return [back(q) for q in poly]+[back(poly[0])]
feats=[]
def add(id,poly): feats.append({'type':'Feature','properties':{'id':id},'geometry':{'type':'Polygon','coordinates':[poly]}})
U1,U2=2.7,6.3
add('crest', band(0.15,U1,0,1,12,1.1))
add('boardwalk', band(U1,U2,0,0.24))
add('pacific', band(U1,U2,0.24,0.46))
add('downtown', band(U1,U2,0.46,0.68))
add('docks', band(U1,U2,0.68,1.0))
add('north', band(U2,L-0.25,0,1,12,1.0))
# piers: rectangles into the ocean from the coast
piers=[]
for u in (3.3,4.1,4.9):
  c=coast(u); v0=c[0]
  q=[pt(u-0.07,v0+0.03),pt(u+0.07,v0+0.03),pt(u+0.07,v0-0.32),pt(u-0.07,v0-0.32)]
  piers.append([back(x) for x in q]+[back(q[0])])
feats.append({'type':'Feature','properties':{'id':'piers'},'geometry':{'type':'MultiPolygon','coordinates':[[p] for p in piers]}})
# causeway: from Rio Grande on the mainland to the bay side of Wildwood
def corridor(a,b,w=0.18):
  A=to(a);B=to(b); d=math.hypot(B[0]-A[0],B[1]-A[1]); nx,ny=-(B[1]-A[1])/d*w,(B[0]-A[0])/d*w
  q=[(A[0]+nx,A[1]+ny),(B[0]+nx,B[1]+ny),(B[0]-nx,B[1]-ny),(A[0]-nx,A[1]-ny)]
  return [back(x) for x in q]+[back(q[0])]
c=coast(4.6); bay=pt(4.6,c[0]+1.2)
add('causeway', corridor((-74.876,39.016), (bay[0]/KX-74.8, bay[1]/KY+LAT0)))
json.dump({'type':'FeatureCollection','features':feats},open('/home/claude/little-las-vegas/public/geo/wildwood.json','w'),separators=(',',':'))
print('ok',[ (f['properties']['id'], len(f['geometry']['coordinates'][0]) ) for f in feats])
