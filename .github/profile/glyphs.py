#!/usr/bin/env python3
"""Gera glyphs.json: contornos e kerning das fontes usadas nas imagens do README.

As imagens desenham o texto como contornos (e não com <text>) para a tipografia
sair igual em qualquer navegador, já que SVG carregado por <img> não baixa fontes.
Só é preciso rodar de novo ao trocar fonte, peso ou o conjunto de caracteres:

  python3 -m venv /tmp/venv && /tmp/venv/bin/pip install fonttools uharfbuzz
  /tmp/venv/bin/python .github/profile/glyphs.py BricolageGrotesque.ttf HankenGrotesk.ttf

As fontes variáveis vêm de github.com/google/fonts (SIL Open Font License 1.1):
  ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf
  ofl/hankengrotesk/HankenGrotesk[wght].ttf
"""
import io
import json
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

CHARS = (
    " !\"%&'()+,-./0123456789:;?@"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    "ÁÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç–—’"
)

# Recursos de OpenType que o renderizador em JS não reproduz ficam desligados,
# para o kerning medido aqui valer para pares de glifos isolados.
FEATURES = {"kern": True, "liga": False, "clig": False, "calt": False}


def number(value):
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"


def build(path, axes):
    font = instancer.instantiateVariableFont(TTFont(path), axes)
    data = io.BytesIO()
    font.save(data)

    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    metrics = font["hmtx"].metrics
    glyphs = {}
    for char in CHARS:
        name = cmap.get(ord(char))
        if name is None:
            print(f"aviso: {path} não tem {char!r}", file=sys.stderr)
            continue
        pen = SVGPathPen(glyph_set, number)
        glyph_set[name].draw(pen)
        glyphs[char] = [metrics[name][0], pen.getCommands()]

    shaper = hb.Font(hb.Face(hb.Blob(data.getvalue())))
    kern = {}
    for a in glyphs:
        for b in glyphs:
            buf = hb.Buffer()
            buf.add_str(a + b)
            buf.guess_segment_properties()
            hb.shape(shaper, buf, FEATURES)
            if len(buf.glyph_infos) != 2:
                continue
            delta = sum(p.x_advance for p in buf.glyph_positions) - glyphs[a][0] - glyphs[b][0]
            if delta:
                kern[a + b] = delta

    os2 = font["OS/2"]
    return {
        "upm": font["head"].unitsPerEm,
        "cap": os2.sCapHeight,
        "xh": os2.sxHeight,
        "glyphs": glyphs,
        "kern": kern,
    }


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    bricolage, hanken = sys.argv[1:]
    fonts = {
        "display": build(bricolage, {"wght": 800, "opsz": 96, "wdth": 100}),
        "text": build(hanken, {"wght": 500}),
        "bold": build(hanken, {"wght": 700}),
    }
    dest = Path(__file__).with_name("glyphs.json")
    dest.write_text(json.dumps({"fonts": fonts}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sizes = ", ".join(f"{k}: {len(v['glyphs'])} glifos / {len(v['kern'])} pares" for k, v in fonts.items())
    print(f"{dest} ({dest.stat().st_size // 1024} KB) {sizes}")


if __name__ == "__main__":
    main()
