"""Hide all worksheet tabs (keep only dashboard tabs visible) in the 4 v2
workbooks. Tableau shows a worksheet as a tab unless its <window> carries
hidden='true'. Dashboard windows stay visible.
"""
import re
from pathlib import Path

V2 = [
    "/tmp/wb-nam-a-portfolio-v2.twb",
    "/tmp/wb-nam-a-risk-v2.twb",
    "/tmp/wb-nam-a-deposit-v2.twb",
    "/tmp/wb-nam-a-digital-v2.twb",
]

for path in V2:
    p = Path(path)
    content = p.read_text(encoding="utf-8")
    # Add hidden='true' to every worksheet window that doesn't already have it.
    # Match: <window class='worksheet' name='...'>  (no hidden attr)
    def add_hidden(m):
        tag = m.group(0)
        if "hidden=" in tag:
            return tag
        return tag.replace(
            "<window class='worksheet' ",
            "<window class='worksheet' hidden='true' ",
        )
    new_content, n = re.subn(
        r"<window class='worksheet' name='[^']*'>",
        add_hidden,
        content,
    )
    p.write_text(new_content, encoding="utf-8")
    hidden_count = new_content.count("<window class='worksheet' hidden='true'")
    print(f"{path}: {n} worksheet windows → {hidden_count} hidden")
