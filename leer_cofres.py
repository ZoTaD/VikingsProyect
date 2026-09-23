"""Lee los inventarios del mundo de Valheim 1.0 (formato por chunks) y cuenta los ítems.

El mundo lo baja bajar_mundo.py a Desktop\\valheim-mundo\\Villa Lujan. Cada objeto con
inventario (cofres, carros, barcos) guarda bajo la clave "items" un bloque binario:
  u32 largo | i32 versión | u16 cantidad | por ítem: ... u16 pila | u32 hash del nombre ...
Los nombres van como hash estable de Valheim, así que se traducen con los IDs de la wiki.

Solo cuenta los cofres de la casa (CASA_CHUNKS). Salida: stock.json y stock.js con el total de cada ítem.
Uso:  python leer_cofres.py            (resumen)
      python leer_cofres.py --debug    (muestra los bloques que no se pudieron leer)
"""
import json
import os
import re
import struct
import sys
import time
from collections import Counter
from pathlib import Path

# VALHEIM_OUT: carpeta donde bajar_mundo.py deja el mundo (por defecto Desktop\valheim-mundo).
BASE = Path(os.environ.get("VALHEIM_OUT") or Path.home() / "Desktop" / "valheim-mundo")
WORLD = BASE / "Villa Lujan"
WIKI = Path.home() / "Desktop" / "valheim-wiki" / "pages" / "main"
OUT = Path(__file__).parent / "stock.json"
NAMES_FILE = Path(__file__).parent / "item_names.json"


def stable_hash(s: str) -> int:
    """Hash estable de Valheim (StringExtensionMethods.GetStableHashCode), como uint32."""
    h1 = h2 = 5381
    i = 0
    while i < len(s):
        h1 = (((h1 << 5) + h1) ^ ord(s[i])) & 0xFFFFFFFF
        if i == len(s) - 1:
            break
        h2 = (((h2 << 5) + h2) ^ ord(s[i + 1])) & 0xFFFFFFFF
        i += 2
    return (h1 + h2 * 1566083941) & 0xFFFFFFFF


def item_ids() -> dict[int, str]:
    """IDs de ítems: item_names.json (sacado de la wiki) más la wiki local si está en esta PC."""
    ids = set()
    if NAMES_FILE.exists():
        ids.update(json.loads(NAMES_FILE.read_text(encoding="utf-8")))
    if (WIKI / "Item IDs.txt").exists():
        table = (WIKI / "Item IDs.txt").read_text(encoding="utf-8")
        ids.update(re.findall(r"\|\|\s*([A-Za-z0-9_]+)\s*$", table, re.M))
        for p in WIKI.glob("*.txt"):
            for m in re.findall(r"^\|\s*id\s*=\s*([A-Za-z0-9_<>/ ]+)$", p.read_text(encoding="utf-8"), re.M):
                ids.update(x for x in re.split(r"<br\s*/?>|\s+", m) if re.fullmatch(r"[A-Za-z0-9_]+", x))
    # también los ids que usa la página (data.js), por si la wiki no los lista
    data = Path(__file__).parent / "data.js"
    if data.exists():
        ids.update(re.findall(r'"([A-Z][A-Za-z0-9_]+)"', data.read_text(encoding="utf-8")))
    return {stable_hash(n): n for n in ids}


KEY_ITEMS = struct.pack("<I", stable_hash("items"))
# Contenedores construidos por los jugadores. Los cofres de botín de ruinas y mazmorras
# (TreasureChest_*) y las lápidas no cuentan como despensa.
# La casa: grupo de chunks donde están los cofres de la base principal (monedas, huerto, barco).
# El otro grupo grande (1e_22) es un depósito de materiales y los sueltos son puestos de avanzada.
CASA_CHUNKS = {"24_1e"}
CHESTS = {"piece_chest_wood", "piece_chest", "piece_chest_blackmetal", "piece_chest_private", "piece_chest_barrel"}
PLAYER_CONTAINERS = {stable_hash(n): n for n in [
    "piece_chest_wood", "piece_chest", "piece_chest_blackmetal", "piece_chest_private",
    "piece_chest_barrel", "Cart", "Karve", "VikingShip", "VikingShip_Ashlands", "Raft",
]}


def _str(bl: bytes, p: int) -> int:
    return p + 1 + bl[p]


def parse_blob(bl: bytes):
    """Inventario 1.0 (versión 109). Por ítem:
    i32 durabilidad·100 | u8 x | u8 y | u8 ? | u8 banderas
    [u16 pila si 0x08] [u16 calidad si 0x04] [u16 variante si 0x02] [u16 nivel de mundo si 0x10] [u16 si 0x80]
    u32 hash del nombre | [i32 + texto + u32 del fabricante si 0x20] | u8 cantidad de datos extra + pares de textos.
    Devuelve [(hash, pila)] o None si el bloque no cierra justo."""
    if len(bl) < 6 or struct.unpack_from("<i", bl, 0)[0] != 109:
        return None
    n = struct.unpack_from("<H", bl, 4)[0]
    p, out = 6, []
    try:
        for _ in range(n):
            p += 7
            fl = bl[p]; p += 1
            stack = 1
            for bit in (0x08, 0x04, 0x02, 0x10, 0x80):
                if fl & bit:
                    v = struct.unpack_from("<H", bl, p)[0]; p += 2
                    if bit == 0x08:
                        stack = v
            h = struct.unpack_from("<I", bl, p)[0]; p += 4
            if fl & 0x20:
                p += 4; p = _str(bl, p); p += 4
            extra = bl[p]; p += 1
            for _ in range(extra):
                p = _str(bl, p); p = _str(bl, p)
            out.append((h, stack))
    except (IndexError, struct.error):
        return None
    return out if p == len(bl) else None


def owner(b: bytes, i: int):
    """Tipo de objeto dueño del inventario: el hash del prefab aparece poco antes de la clave."""
    for back in range(8, 100):
        if i - back < 0:
            break
        h = struct.unpack_from("<I", b, i - back)[0]
        if h in PLAYER_CONTAINERS:
            return PLAYER_CONTAINERS[h]
    return None


def main() -> int:
    debug = "--debug" in sys.argv
    names = item_ids()
    totals, kinds, unknown, elsewhere, by_chunk = Counter(), Counter(), Counter(), Counter(), Counter()
    skipped = unreadable = 0
    for f in sorted(WORLD.glob("*.chunk")):
        in_casa = f.name.split("__")[0] in CASA_CHUNKS
        b = f.read_bytes()
        i = 0
        while (i := b.find(KEY_ITEMS, i)) >= 0:
            if i + 8 > len(b):
                break
            length = struct.unpack_from("<I", b, i + 4)[0]
            if not 6 <= length <= 20000:
                i += 4
                continue
            kind = owner(b, i)
            if kind is None:
                skipped += 1
            elif kind in CHESTS:
                by_chunk[f.name.split("__")[0]] += 1
            if kind is None:
                pass
            elif kind not in CHESTS or not in_casa:
                elsewhere[kind] += 1
            else:
                items = parse_blob(b[i + 8:i + 8 + length])
                if items is None:
                    unreadable += 1
                    if debug:
                        print(f"no pude leer {f.name}@{i}")
                else:
                    kinds[kind] += 1
                    for h, s in items:
                        if h in names:
                            totals[names[h]] += s
                        else:
                            unknown[h] += s
            i += 8 + length
    last = BASE / "ultima_descarga.txt"
    OUT.write_text(json.dumps({
        "leido": time.strftime("%Y-%m-%d %H:%M"),
        "descarga": last.read_text(encoding="utf-8").strip() if last.exists() else None,
        "cofres_casa": sum(kinds.values()), "tipos": dict(kinds), "sin_leer": unreadable,
        "fuera_de_casa": dict(elsewhere), "botin_ignorado": skipped,
        "cofres_por_zona": dict(by_chunk.most_common()),
        "items": dict(totals.most_common()),
        "sin_nombre": {str(k): v for k, v in unknown.most_common()},
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    (OUT.parent / "stock.js").write_text("window.STOCK = " + OUT.read_text(encoding="utf-8") + ";\n", encoding="utf-8")
    print(f"cofres de la casa: {dict(kinds)}, sin leer: {unreadable}, fuera de casa: {dict(elsewhere)}, botín ignorado: {skipped}")
    print(f"{len(totals)} ítems distintos, {len(unknown)} sin nombre")
    for n, s in totals.most_common(30):
        print(f"  {s:6}  {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
