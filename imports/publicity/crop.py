from PIL import Image
import os
P='/home/claude/imports/art/owner/pending/'
O='/home/claude/llv-showbiz/imports/publicity/'
os.makedirs(O,exist_ok=True)
def save(im,key,w=320):
    h=round(im.height*w/im.width)
    im.convert('RGB').resize((w,h),Image.LANCZOS).save(O+key+'.webp','WEBP',quality=78)
def grid(f,xs,ys,prefix,skip=(),inset=3):
    im=Image.open(P+f)
    n=0
    for r in range(len(ys)-1):
        for c in range(len(xs)-1):
            n+=1
            if n in skip: continue
            box=(xs[c]+inset,ys[r]+inset,xs[c+1]-inset,ys[r+1]-inset)
            save(im.crop(box),f'{prefix}{n:02d}')
grid('performers_photos_12.png',[3,282,561,840,1120],[3,466,934,1400],'pb')
W,H=1774,887
grid('photo_women_10.png',[round(i*W/5) for i in range(6)],[0,443,887],'pg',skip=(2,),inset=4)
grid('bw_women_24.png',[0,258,514,767,1023,1278,1536],[0,300,550,811,1024],'pw',skip=(2,),inset=4)
im=Image.open(P+'vocal_group_stage.png'); save(im,'vg_stage',w=960)
