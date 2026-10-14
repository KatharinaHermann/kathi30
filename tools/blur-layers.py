# Blurs the layer captures from blur-layers.js into site/assets/blur/*.webp (1x, alpha, premultiplied blur so edges stay clean).
#   python3 tools/blur-layers.py out/ site/assets/blur 16
import sys, os, numpy as np
from PIL import Image, ImageFilter
src, dst, radius = sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 16
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(src, f)).convert('RGBA')
    a = np.asarray(im).astype(np.float32) / 255
    pre = a.copy(); pre[..., :3] *= pre[..., 3:4]                      # premultiply so transparent pixels don't bleed black
    blurred = Image.fromarray((pre * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius * 2))  # captures are 2x
    b = np.asarray(blurred).astype(np.float32) / 255
    rgb = b[..., :3] / np.maximum(b[..., 3:4], 1e-4)
    outp = np.concatenate([np.clip(rgb, 0, 1), b[..., 3:4]], axis=-1)
    # black type would smear as a dark smudge: lift those layers toward white and thin them out
    light = {'kicker': (.7, .6), 'intro': (.7, .6), 'countdown': (.45, .75), 'badges': (.5, .7), 'thirty': (.5, .7)}.get(f[:-4])
    if light:
        outp[..., :3] = outp[..., :3] * (1 - light[0]) + light[0]
        outp[..., 3] *= light[1]
    o = Image.fromarray((outp * 255).astype(np.uint8)).resize((im.width // 2, im.height // 2), Image.LANCZOS)
    o.save(os.path.join(dst, f[:-4] + '.webp'), 'WEBP', quality=72, method=6)
    print(f, o.size, os.path.getsize(os.path.join(dst, f[:-4] + '.webp')) // 1024, 'KB')
