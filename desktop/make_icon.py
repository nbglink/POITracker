"""Generate desktop/icon.ico for the POI Tracker desktop build.

Theme-matched: dark terminal background, orange accent (the app's --accent),
rising candlesticks, and an orange "Point of Interest" target ring + crosshair.
Run:  .venv\\Scripts\\python.exe desktop\\make_icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # render large, then downsample to icon sizes for crispness
HERE = Path(__file__).resolve().parent

BG = (13, 16, 22, 255)        # ~ app --bg (#0D1016)
BORDER = (38, 44, 56, 255)
GREEN = (38, 200, 100, 255)
RED = (235, 70, 70, 255)
ACCENT = (249, 130, 30, 255)  # ~ app --accent (orange)


def rr(d, box, radius, **kw):
    d.rounded_rectangle(box, radius=radius, **kw)


def build() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded-square background + subtle border.
    m, rad = 36, 210
    rr(d, [m, m, S - m, S - m], rad, fill=BG)
    rr(d, [m, m, S - m, S - m], rad, outline=BORDER, width=10)

    # Rising candlesticks (open-high-low-close style bodies + wicks).
    def candle(cx, body_top, body_bot, wick_top, wick_bot, color, bw=96, ww=18):
        d.rounded_rectangle([cx - ww // 2, wick_top, cx + ww // 2, wick_bot], radius=ww // 2, fill=color)
        d.rounded_rectangle([cx - bw // 2, body_top, cx + bw // 2, body_bot], radius=20, fill=color)

    candle(300, 600, 770, 540, 815, GREEN)
    candle(490, 470, 650, 410, 700, RED)
    candle(680, 330, 560, 270, 600, GREEN)

    # Orange POI target ring + crosshair, marking the last candle's entry zone.
    cx, cy, r = 690, 415, 165
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=40)
    tick, gap, w = 120, 26, 28
    d.line([cx - r - tick, cy, cx - r - gap, cy], fill=ACCENT, width=w)
    d.line([cx + r + gap, cy, cx + r + tick, cy], fill=ACCENT, width=w)
    d.line([cx, cy - r - tick, cx, cy - r - gap], fill=ACCENT, width=w)
    d.line([cx, cy + r + gap, cx, cy + r + tick], fill=ACCENT, width=w)
    d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=ACCENT)

    return img


def main() -> None:
    img = build()
    img.save(HERE / "icon-preview.png")  # for eyeballing the design
    sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    img.save(HERE / "icon.ico", sizes=sizes)
    print("wrote", HERE / "icon.ico", "and icon-preview.png")


if __name__ == "__main__":
    main()
