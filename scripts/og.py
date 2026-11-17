from PIL import Image, ImageDraw, ImageFont
im=Image.new('RGB',(1200,630),'#f6f4ee');d=ImageDraw.Draw(im)
serif='/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
sans='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
d.text((80,55),'papertube',font=ImageFont.truetype(sans,33),fill='#263d2d')
d.ellipse((270,80,279,89),fill='#719150')
d.text((80,165),'Follow your curiosity.',font=ImageFont.truetype(serif,64),fill='#263d2d')
d.text((83,270),'The papers that matter,',font=ImageFont.truetype(serif,48),fill='#263d2d')
d.text((83,335),'mapped by theme.',font=ImageFont.truetype(serif,48),fill='#263d2d')
d.line((85,478,1115,478),fill='#d9dfcf',width=2)
for x,y,r,c in [(180,478,11,'#718a50'),(380,465,8,'#9c94d5'),(570,478,15,'#718a50'),(780,488,10,'#ca9975'),(1000,478,18,'#718a50')]:
 d.ellipse((x-r-5,y-r-5,x+r+5,y+r+5),fill='#e1e7d7');d.ellipse((x-r,y-r,x+r,y+r),fill=c)
d.text((83,554),'FREE. NO SIGN-UP. ALWAYS READ THE PAPER.',font=ImageFont.truetype(sans,15),fill='#7a876d')
im.save('public/og.png')
