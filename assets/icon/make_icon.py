"""Render Finance Flow's NeoPOP app icon (Icon A: raised yellow-green tile with a serif f).

usage (from the repo root, needs Pillow and node_modules): python assets/icon/make_icon.py .
Writes assets/icon/*.png, assets/icon/*.svg and the Android mipmaps.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = sys.argv[1]
FONT = os.path.join(ROOT, 'node_modules/@expo-google-fonts/dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf')

INK = (13, 13, 13, 255)          # #0D0D0D
ACCENT = (229, 254, 64, 255)     # #E5FE40
EDGE_R = (160, 178, 45, 255)     # #A0B22D
EDGE_B = (69, 76, 19, 255)       # #454C13

# Geometry in design units, from the canvas board (512 wide).
TILE, DEPTH, GLYPH = 236, 22, 230


def draw_mark(img, cx, cy, unit):
    """Draw the tile + edges + f so the whole mark (tile and its depth) is centred on (cx, cy)."""
    d = ImageDraw.Draw(img)
    t, dp = TILE * unit, DEPTH * unit
    x0 = cx - (t + dp) / 2
    y0 = cy - (t + dp) / 2
    x1, y1 = x0 + t, y0 + t
    d.polygon([(x1, y0), (x1 + dp, y0 + dp), (x1 + dp, y1 + dp), (x1, y1)], fill=EDGE_R)
    d.polygon([(x0, y1), (x1, y1), (x1 + dp, y1 + dp), (x0 + dp, y1 + dp)], fill=EDGE_B)
    d.rectangle([x0, y0, x1, y1], fill=ACCENT)
    font = ImageFont.truetype(FONT, round(GLYPH * unit))
    l, tp, r, b = d.textbbox((0, 0), 'f', font=font)
    # Centre the glyph's ink box on the tile.
    d.text((x0 + (t - (r - l)) / 2 - l, y0 + (t - (b - tp)) / 2 - tp), 'f', font=font, fill=INK)


def full_icon(size, ss=4):
    """Black square with the mark at the canvas design's proportions (mark = 258/512 of the side)."""
    big = Image.new('RGBA', (size * ss, size * ss), INK)
    draw_mark(big, size * ss / 2, size * ss / 2, size * ss / 512)
    return big.resize((size, size), Image.LANCZOS)


def foreground(size, ss=4):
    """Adaptive-icon foreground: transparent 108dp canvas; the square mark sits inside the
    66dp safe circle (its diagonal fits), so no launcher mask clips its corners."""
    big = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0))
    mark_dp = 66 / 2 ** 0.5           # side of a square whose diagonal is 66dp
    unit = (mark_dp / 108) * size * ss / (TILE + DEPTH)
    draw_mark(big, size * ss / 2, size * ss / 2, unit)
    return big.resize((size, size), Image.LANCZOS)


def round_icon(size):
    img = full_icon(size)
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    img.putalpha(mask.resize((size, size), Image.LANCZOS))
    return img


# Expo sources (app.json points at these).
icon_dir = os.path.join(ROOT, 'assets/icon')
full_icon(1024).save(os.path.join(icon_dir, 'icon.png'))
foreground(1024).save(os.path.join(icon_dir, 'adaptive-fg.png'))

# Android mipmaps: legacy 48dp icons and 108dp adaptive foregrounds.
res = os.path.join(ROOT, 'android/app/src/main/res')
for density, scale in [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]:
    folder = os.path.join(res, f'mipmap-{density}')
    full_icon(round(48 * scale)).save(os.path.join(folder, 'ic_launcher.webp'), lossless=True)
    round_icon(round(48 * scale)).save(os.path.join(folder, 'ic_launcher_round.webp'), lossless=True)
    foreground(round(108 * scale)).save(os.path.join(folder, 'ic_launcher_foreground.webp'), lossless=True)
    bg = os.path.join(folder, 'ic_launcher_background.webp')
    if os.path.exists(bg):
        os.remove(bg)  # background is now a solid colour (@color/iconBackground)

print('ok')
