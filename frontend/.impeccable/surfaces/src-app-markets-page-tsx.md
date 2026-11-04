---
version: 1
slug: "src-app-markets-page-tsx"
primary_target: "src/app/markets/page.tsx"
related_targets: ["src/components/markets-index.tsx"]
---

# Markets index

Scope: the /markets route. Visitor mode: Operate. Audience: traders and prediction-market users choosing where to trade. Job: see what is live now and enter a market. Constraints: live chain values only, no invented metrics; one entry per question (spot and perp of the same question share one card); question and odds equally prominent.

## Direction contract

THESIS: The board of live questions. Each question is one card whose odds are the loudest number on the page; refuses the old split into "native" and "perp" columns of key-value tables.

OWN-WORLD: The Engineering Sheet unchanged: black dot grid, 1px frames, 12px corners, Geist Mono only, Signal orange for the live price line and the primary action square, green only for the long side. Odds in display weight with flipping digits; a 24h index line drawn in Signal.

STORY: The visitor sees how many questions are trading, reads each question with its YES probability and movement, and picks leverage (perp) or tokens (spot) from the same card.

FIRST VIEWPORT: Title row with a live summary (questions, trading count, block) and search on the right; "Live now" section rule; two cards side by side: status chip and countdown on top, question at title size, odds at display size beside a 24h sparkline, bid/ask, OI and leverage row, then "Trade with leverage" (primary) and "Buy YES/NO tokens".

FORM: Live question cards, position 5 of 6 on the ranked list, seed key c5e1a80b.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
