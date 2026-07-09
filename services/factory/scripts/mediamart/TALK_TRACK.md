# MediaMart Control Tower — Talk Track (V1)

**Demo tenant:** `mediamart` · Portal `/t/mediamart` · Tableau folder `Demo/MediaMart`
**Story:** A consumer-electronics retailer's exec "Control Tower" — doanh thu →
khách hàng → chuỗi cung ứng → điểm bán → and an **AI agent that recommends retail
campaigns** grounded in the tenant's own data.

All numbers below are from the live extract `mediamart.hyper` (24 months,
2024-07-01 → 2026-06-30, seed 42). Data is synthetic (flagged "Dữ liệu mô phỏng").

---

## Setup (30s)

> "MediaMart is a Vietnamese consumer-electronics retailer — 28 stores across
> North & North-Central Vietnam, ~2.685 nghìn tỷ đồng doanh thu trong 24 tháng.
> This portal is their executive Control Tower on Tableau Cloud, plus an AI
> analytics agent. Everything is governed, single-tenant, 100% tiếng Việt."

Log in as `mediamart@demo.com`. Five dashboards in the left nav (D1→D5).

---

## D1 · Doanh thu & Lợi nhuận  (`05e624cc`)

> "The opening view. Six KPI cards, each with a 24-month sparkline underneath —
> doanh thu **2.684 tỷ**, biên lợi nhuận gộp **27.8%**, **86.158** đơn hoàn tất,
> giá trị đơn TB **31.2 triệu**."

Point at the monthly bar chart:
> "Notice the two tallest bars — **Tháng 11 (Black Friday, 329 tỷ)** and **Tháng
> 2 (Tết, 285 tỷ)**. Vietnamese electronics retail lives and dies on these two
> peaks. The category ranking on the right: **Television (734 tỷ)** and
> **Laptop (689 tỷ)** are the revenue engine."

## D2 · Customer 360 & Churn  (`c707f2cc`)

> "Now the customer base — 4.500 khách hàng. The alarming number is here:
> **50.5% (2.272 khách) ở nhóm nguy cơ rời bỏ Cao**, and they hold **813 tỷ**
> doanh thu — that's revenue at risk."

Point at the three rankings:
> "The risk is concentrated in **Standard + Silver** tiers (776 tỷ of the 813).
> And the third chart already tells us what to do — the **NextBestOffer** field
> prescribes the win-back play per customer: Free Shipping, Win-back Voucher 20%,
> Re-engagement. This sets up the AI conversation later."

## D3 · Chuỗi cung ứng & Hết hàng (OOS)  (`97275cc5`)

> "Supply-side. **182 dòng tồn kho đang hết hàng — 25%** so với mục tiêu
> campaign. The category ranking flags **Smartphone (33 dòng)** as the worst,
> and **7 cửa hàng** need urgent restock/transfer — MediaMart Hanoi 05 leads
> with 11 OOS lines. This is money left on the table during peak season."

## D4 · Điểm bán & Khu vực  (`40acfbaa`)

> "The store network. **Bắc Bộ = 2.396 tỷ (89%)** of revenue; the channel split
> shows **In-Store still dominant at 1.477 tỷ**, but Online (670) and Mobile App
> (538) together are now ~45% — the digital shift is real. Payment mix skews to
> Credit Card and Installment — a financing-partnership angle."

## D5 · AI Deep-Dive · Giữ chân & Bán chéo  (`3940be7e`)

> "This dashboard is the launch-pad for the AI agent. It frames the opportunity:
> **735 tỷ at risk**, and a **15% win-back would recover ~105 tỷ**. Revenue at
> risk by segment — **Family (325 tỷ)** and **Young Professional (227 tỷ)** are
> the priorities."

**Then open the chat panel and ask (the punchline):**

> **"Nhóm khách hàng nào nguy cơ rời bỏ cao, và nên làm gì để giữ chân?"**

The agent (advisory mode `retail-actions`) will:
1. Query the `mediamart` datasource for the churn cohort and show a chart.
2. Propose 2–4 **retail plays as the headline** — win-back the Standard+Silver
   churn cohort, activate the NextBestOffer per tier, upgrade at-risk loyalty
   tiers, promote a growing category — each tied to a number from the data.
3. Close with ONE optional line on execution via Salesforce (Data Cloud segment
   → Marketing Cloud journey → Einstein propensity → Pulse monitoring).

> "Note the framing: the recommendation is always a **MediaMart retail action**,
> and Salesforce is only the execution channel — not a product pitch."

**Other good asks:**
- "Cửa hàng nào đang thiếu hàng nặng nhất, xử lý thế nào?" → restock/transfer play
- "Ngành hàng nào nên đẩy khuyến mãi để tăng biên lợi nhuận?" → Gaming/Laptop margin
- "Đề xuất chiến dịch cross-sell cho nhóm Young Professional" → NBO + channel mix

---

## Live artifacts

| Dashboard | Workbook id |
|---|---|
| D1 Doanh Thu | `05e624cc-6b74-43e8-8300-498d96f11a16` |
| D2 Customer 360 | `c707f2cc-7ea1-4c1c-bdb7-4f3569de054e` |
| D3 Chuỗi cung ứng | `97275cc5-12b5-4b54-ac02-84eb22bf998d` |
| D4 Điểm bán | `40acfbaa-977b-49af-9369-9e7cf3c04d7c` |
| D5 AI Deep-Dive | `3940be7e-d4b6-476d-bb47-27fc1e933e29` |

Datasource `mediamart` `e646e8a7-baa5-42db-bcfd-3550fba4f21f` (self-contained
hyper extract; feeds both the dashboards and the MCP AI agent).

Build: `scripts/mediamart/provision_mediamart.py` (data → extract → publish),
`build_mediamart_d1..d5.py` (workbooks), `mediamart_lib.py` (shared builders).
Rebuild all: run provision `--publish`, then each `build_mediamart_dN.py --publish`.
