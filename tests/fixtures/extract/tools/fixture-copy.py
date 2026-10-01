# Usage: python3 fixture-copy.py <docusaurus build dir> <fixture site dir> [handmade]
# Copies the built HTML, stripping <script>, <link>, and <style>; with
# `handmade`, also writes the hand-made pages (foo.html, assets/, ...).
import os, re, sys

src = sys.argv[1]
dst = sys.argv[2]

SCRIPT = re.compile(r'<script\b[^>]*>.*?</script>', re.S | re.I)
LINK = re.compile(r'<link\b[^>]*>', re.I)
STYLE = re.compile(r'<style\b[^>]*>.*?</style>', re.S | re.I)

for dirpath, _, files in os.walk(src):
    for f in files:
        if not f.endswith('.html'):
            continue
        p = os.path.join(dirpath, f)
        rel = os.path.relpath(p, src)
        s = open(p, encoding='utf-8', newline='').read()
        s = SCRIPT.sub('', s)
        s = LINK.sub('', s)
        s = STYLE.sub('', s)
        out = os.path.join(dst, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8', newline='').write(s)
        print(rel)

if len(sys.argv) > 3 and sys.argv[3] == 'handmade':
    def page(title, body):
        return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
                f'<title>{title}</title>\n</head>\n<body>\n{body}\n</body>\n</html>\n')

    pages = {
        'foo.html': page('Foo (flat file)', '<main>\n<article>\n<h1>Foo Flat</h1>\n<p>This content comes from foo.html, the flat-file variant of the /foo route.</p>\n</article>\n</main>'),
        'foo/index.html': page('Foo (directory index)', '<main>\n<article>\n<h1>Foo Directory</h1>\n<p>This content comes from foo/index.html, the directory-index variant of the /foo route.</p>\n</article>\n</main>'),
        'assets/ignored.html': page('Ignored Asset Page', '<main>\n<article>\n<h1>Ignored Asset Page</h1>\n<p>This page lives under assets/ and should be skipped by the extractor, even though it has an article with enough text to otherwise qualify as a real documentation page.</p>\n</article>\n</main>'),
        'no-article.html': page('No Article Page', '<div class="content">\n<h1>No Article Page</h1>\n<p>This page has no article element and no main element. All of its content sits inside a plain div so that the extractor has to fall back to a broader selector, such as the body, to find anything useful.</p>\n<p>It includes a second paragraph so the total amount of text comfortably exceeds three hundred characters, which keeps it above any minimum content length threshold the extractor might apply to pages.</p>\n</div>'),
    }
    for rel, content in pages.items():
        out = os.path.join(dst, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8', newline='').write(content)
        print(rel, '(handmade)')
