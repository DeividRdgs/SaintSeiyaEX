# Recorta os cards individuais do poster calendario-banners.png para img/banners/.
# Rodar de novo sempre que chegar um poster novo da comunidade (mesma diagramação:
# 2 fileiras de 14 cards). A ordem dos IDs abaixo deve bater com a ordem dos cards
# no poster (esquerda→direita, fileira de cima primeiro) e com BANNER_CALENDAR em
# js/banners-calendar.js.
# Uso: python tools/build-banner-cards.py
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTER = os.path.join(ROOT, 'calendario-banners.png')
OUT_DIR = os.path.join(ROOT, 'img', 'banners')

# Geometria do poster 1843x1213 (medida por perfil de brilho das colunas)
X0 = 51        # borda esquerda do primeiro card
PITCH = 125.38 # passo horizontal entre cards
CARD_W = 118
ROWS_Y = [188, 518]  # topo das fileiras 1 e 2
CARD_H = 249

# IDs do codex na ordem do poster (fileira 1, depois fileira 2)
HERO_IDS = [
    1029, 1094, 1055, 1083, 1042, 1030, 1089, 1003, 1086, 1071, 1095, 1046, 1051, 1001,
    1021, 1014, 1092, 1085, 1048, 1032, 1043, 1061, 1084, 1064, 1019, 1073, 1078, 1066,
]

os.makedirs(OUT_DIR, exist_ok=True)
poster = Image.open(POSTER).convert('RGB')
for idx, hero_id in enumerate(HERO_IDS):
    row, col = divmod(idx, 14)
    x = round(X0 + col * PITCH)
    y = ROWS_Y[row]
    card = poster.crop((x, y, x + CARD_W, y + CARD_H))
    out = os.path.join(OUT_DIR, f'{hero_id}.webp')
    card.save(out, 'WEBP', quality=86)
print(f'{len(HERO_IDS)} cards recortados em img/banners/')
