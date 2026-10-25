"""Genera los iconos de Rumbo (app, Android maskable, iPhone y el badge de notificaciones).

Uso:  python scripts/make-icons.py      (requiere Pillow)
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public'
SS = 4  # supermuestreo para bordes suaves

C1 = (26, 84, 214)    # #1A54D6
C2 = (76, 155, 255)   # #4C9BFF


def gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(C1, C2))
    return img


def compass(draw, cx, cy, r, color_ring, color_n, color_s, ring_w):
    """Anillo + aguja en diamante (mitad norte sólida, mitad sur más suave)."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color_ring, width=ring_w)
    ang = math.radians(-45)  # aguja apuntando al noreste
    L, W = r * 0.62, r * 0.24
    tip_n = (cx + L * math.cos(ang), cy + L * math.sin(ang))
    tip_s = (cx - L * math.cos(ang), cy - L * math.sin(ang))
    side1 = (cx + W * math.cos(ang + math.pi / 2), cy + W * math.sin(ang + math.pi / 2))
    side2 = (cx - W * math.cos(ang + math.pi / 2), cy - W * math.sin(ang + math.pi / 2))
    draw.polygon([tip_n, side1, side2], fill=color_n)
    draw.polygon([tip_s, side1, side2], fill=color_s)


def app_icon(size, rounded, scale):
    S = size * SS
    bg = gradient(S).convert('RGBA')
    # brillo suave arriba a la izquierda
    glow = Image.new('L', (S, S), 0)
    ImageDraw.Draw(glow).ellipse([-S * 0.3, -S * 0.45, S * 0.9, S * 0.55], fill=40)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.08))
    bg = Image.composite(Image.new('RGBA', (S, S), (255, 255, 255, 255)), bg, glow.point(lambda v: v * 0.5))
    d = ImageDraw.Draw(bg)
    r = S * 0.30 * scale
    compass(d, S / 2, S / 2, r, (255, 255, 255, 255), (255, 138, 31, 255), (255, 255, 255, 255), max(2, round(r * 0.16)))
    if rounded:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.225, fill=255)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        out.paste(bg, (0, 0), mask)
        bg = out
    return bg.resize((size, size), Image.LANCZOS)


def badge(size):
    """Silueta blanca sobre transparente: Android la pinta en la barra de estado."""
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = S * 0.40
    compass(d, S / 2, S / 2, r, (255, 255, 255, 255), (255, 255, 255, 255), (255, 255, 255, 255), round(r * 0.18))
    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    app_icon(192, True, 1.0).save(OUT / 'icon-192.png')
    app_icon(512, True, 1.0).save(OUT / 'icon-512.png')
    app_icon(512, False, 0.78).save(OUT / 'icon-maskable-512.png')   # zona segura de Android
    app_icon(180, False, 0.95).convert('RGB').save(OUT / 'apple-touch-icon.png')  # iPhone redondea solo
    app_icon(32, True, 1.1).save(OUT / 'favicon-32.png')
    badge(96).save(OUT / 'badge-96.png')
    print('Iconos generados en', OUT)
