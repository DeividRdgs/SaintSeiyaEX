# Extração determinística do monolito D:\Triade Site\index.html
# Divide o <style> e o <script> principal em arquivos, garantindo que a
# concatenação dos segmentos JS seja byte a byte idêntica ao script original.
import hashlib
import io
import os
import re
import sys

SRC = r"D:\Triade Site\index.html"
OUT = r"C:\Users\Deivid\PhpstormProjects\SaintSeiyaEX"

s = io.open(SRC, encoding="utf-8", newline="").read()

# ---------- localizar blocos ----------
style_m = re.search(r"<style[^>]*>(.*?)</style>", s, re.S)
assert style_m, "style não encontrado"

scripts = list(re.finditer(r"<script([^>]*)>(.*?)</script>", s, re.S))
main = max(scripts, key=lambda m: len(m.group(2)))
body = main.group(2)
print("main script:", main.start(), "len", len(body))

# ---------- scanner JS: fim de uma declaração const NAME = <literal>; ----------
def stmt_end(src: str, start: int) -> int:
    """start aponta para 'const'. Retorna índice logo após o ';' final."""
    i = src.index("=", start) + 1
    while src[i] in " \t\r\n":
        i += 1
    open_ch = src[i]
    assert open_ch in "[{", f"esperava literal em {i}, achei {src[i]!r}"
    pairs = {"[": "]", "{": "}"}
    depth = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in "[{":
            depth += 1
            i += 1
        elif c in "]}":
            depth -= 1
            i += 1
            if depth == 0:
                break
        elif c in ("'", '"'):
            q = c
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                elif src[i] == q:
                    i += 1
                    break
                else:
                    i += 1
        elif c == "`":
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                elif src[i] == "`":
                    i += 1
                    break
                elif src[i] == "$" and i + 1 < n and src[i + 1] == "{":
                    # template expression: bracket-match simples (dados não têm nesting maluco)
                    d2 = 1
                    i += 2
                    while i < n and d2:
                        if src[i] == "{":
                            d2 += 1
                        elif src[i] == "}":
                            d2 -= 1
                        i += 1
                else:
                    i += 1
        elif c == "/" and i + 1 < n and src[i + 1] == "/":
            i = src.index("\n", i)
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            i = src.index("*/", i) + 2
        else:
            i += 1
    while i < n and src[i] in " \t\r\n":
        i += 1
    assert src[i] == ";", f"esperava ';' em {i}, achei {src[i]!r}"
    return i + 1

def decl_start(name: str) -> int:
    m = re.search(r"^const %s\b" % re.escape(name), body, re.M)
    assert m, name
    return m.start()

names = ["UI_TEXTS", "CODEX_HEROES", "CODEX_ARTIFACTS", "ARTIFACT_DETAILS", "CODEX_CARDS"]
bounds = {}
for nm in names:
    a = decl_start(nm)
    b = stmt_end(body, a)
    bounds[nm] = (a, b)
    print(f"{nm}: [{a}, {b}) len={b-a}")

# ---------- montar segmentos sequenciais ----------
def only_comments(txt: str) -> bool:
    """True se o trecho contém apenas whitespace e comentários de linha."""
    return all(ln.strip() == "" or ln.strip().startswith("//") for ln in txt.splitlines())

FNAME = {
    "UI_TEXTS": "js/data/i18n.js",
    "CODEX_HEROES": "js/data/heroes.js",
    "CODEX_ARTIFACTS": "js/data/artifacts.js",
    "ARTIFACT_DETAILS": "js/data/artifacts.js",
    "CODEX_CARDS": "js/data/cards.js",
}

ordered = sorted(bounds.items(), key=lambda kv: kv[1][0])
segments = []  # (filename, start, end) — em ordem, cobrindo body inteiro
cursor = 0
part = 1
for nm, (a, b) in ordered:
    assert a >= cursor, f"sobreposição em {nm}"
    fname = FNAME[nm]
    if a > cursor:
        gap = body[cursor:a]
        prev_same = segments and segments[-1][0] == fname
        if only_comments(gap) and (prev_same or not segments or True):
            # gap de comentários gruda no arquivo de dados seguinte
            a = cursor
        else:
            segments.append((f"js/app-part{part}.js", cursor, a))
            part += 1
    if segments and segments[-1][0] == fname:
        segments[-1] = (fname, segments[-1][1], b)
    else:
        segments.append((fname, a, b))
    cursor = b
if cursor < len(body):
    segments.append(("js/app.js", cursor, len(body)))

names_seq = [f for f, _, _ in segments]
assert len(names_seq) == len(set(names_seq)), f"arquivo repetido na sequência: {names_seq}"

# ---------- verificação: concatenação == original ----------
concat = "".join(body[a:b] for _, a, b in segments)
assert concat == body, "concatenação difere do original!"
print("OK: concatenação byte a byte idêntica ao script original")
print("sha256:", hashlib.sha256(body.encode("utf-8")).hexdigest()[:16])

# ---------- escrever arquivos ----------
os.makedirs(os.path.join(OUT, "css"), exist_ok=True)
os.makedirs(os.path.join(OUT, "js", "data"), exist_ok=True)

written = []
for fname, a, b in segments:
    path = os.path.join(OUT, fname.replace("/", os.sep))
    io.open(path, "w", encoding="utf-8", newline="").write(body[a:b])
    written.append(fname)
    print("escrito", fname, b - a, "chars")

io.open(os.path.join(OUT, "css", "style.css"), "w", encoding="utf-8", newline="").write(style_m.group(1))
print("escrito css/style.css", len(style_m.group(1)), "chars")

# ---------- novo index.html ----------
new_html = s[:style_m.start()] + '<link rel="stylesheet" href="css/style.css">' + s[style_m.end():]
tags = "\n".join(f'<script defer src="{f}"></script>' for f in written)
# recalcular posição do script principal no html modificado
main_m = re.search(r"<script>" + re.escape(body[:200]), new_html, re.S)
assert main_m, "script principal não relocalizado"
end_tag = new_html.index("</script>", main_m.start()) + len("</script>")
new_html = new_html[:main_m.start()] + tags + new_html[end_tag:]
io.open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="").write(new_html)
print("escrito index.html", len(new_html), "chars")
print("ordem dos scripts:", written)
