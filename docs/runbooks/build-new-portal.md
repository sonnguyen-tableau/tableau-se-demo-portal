# Dựng Một Portal Tenant Mới — Từ Yêu Cầu Đến Sản Phẩm

> Runbook tổng hợp toàn bộ quy trình xây dựng một **portal analytics có thương
> hiệu** cho một công ty/ngành mới trong `tableau-ai-portal` (như VNPT,
> MediaMart, Nam A Bank, Mey Group, VACS, SHB). Đúc kết từ 8 tenant đã dựng —
> gồm cả các "cạm bẫy" strict-mode của Tableau Cloud đã trả giá bằng nhiều giờ
> ở lần đầu.
>
> Đây là bản mở rộng của skill `.claude/skills/new-tenant-portal`. Đọc cùng:
> [`tableau-cloud-setup.md`](./tableau-cloud-setup.md),
> [`local-development.md`](./local-development.md), và
> [`../architecture/overview.md`](../architecture/overview.md).

---

## Mục lục

1. [Dự án là gì](#1-dự-án-là-gì)
2. [Kiến trúc & luồng dữ liệu](#2-kiến-trúc--luồng-dữ-liệu)
3. [Hai kỹ thuật dựng dashboard: chọn cái nào](#3-hai-kỹ-thuật-dựng-dashboard-chọn-cái-nào)
4. [Quy trình dựng portal mới — 6 phase](#4-quy-trình-dựng-portal-mới--6-phase)
5. [Bảng cạm bẫy Tableau Cloud strict-mode](#5-bảng-cạm-bẫy-tableau-cloud-strict-mode)
6. [Checklist đầu-cuối](#6-checklist-đầu-cuối)
7. [Tenant tham chiếu & tài sản tái dùng](#7-tenant-tham-chiếu--tài-sản-tái-dùng)

---

## 1. Dự án là gì

`tableau-ai-portal` là một **portal analytics nhúng đa tenant** trên Tableau
Cloud, kèm một **AI agent tự phục vụ** (Claude) trả lời câu hỏi ngôn ngữ tự
nhiên dựa trên dữ liệu Tableau đã được quản trị (qua `@tableau/mcp-server`).

Hai hệ thống con:

| Hệ thống | Vai trò |
|---|---|
| **Portal** | Nhúng dashboard Tableau Cloud + Pulse metrics cho từng tenant, mỗi tenant có thương hiệu (màu/logo) và folder Tableau riêng. AI chat agent grounded trong dữ liệu. |
| **Demo Factory** | Nhập URL khách → Claude profile doanh nghiệp → sinh 2 năm dữ liệu mẫu → publish lên Cloud → tham số hóa workbook template → tạo Pulse metric → trích màu thương hiệu → provision portal, dưới 5 phút. |

- **Live URL**: `https://tableau-portal-mu.vercel.app`
- **Tableau site**: `vietnam` trên `https://prod-apsoutheast-c.online.tableau.com`
- **8 tenant đang chạy**: `vnpt` (telecom), `mediamart` (retail-mediamart),
  `meygroup` (retail-realestate), `nam-a-bank` + `salesforce-bank`
  (retail-banking), `shb` (sme-corporate-banking), `vacs` (airline-catering),
  `vincomretail` (retail-mall).

### Stack

| Layer | Công nghệ |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript strict, Tailwind, shadcn/ui |
| Nhúng | Tableau Embedding API v3 (`<tableau-viz>` web component) |
| Portal backend | Next.js Route Handlers (Node runtime), `jose` cho JWT |
| AI agent | `@anthropic-ai/sdk` + MCP tool-use qua Tableau MCP HTTP sidecar |
| Factory sidecar | Python 3.12 + FastAPI + Playwright + Faker + NumPy + Hyper API + TSC + Document API |
| Auth (user) | NextAuth (Auth.js v5), dev mode qua `DEV_USERS_JSON` |
| Auth (Tableau) | Connected App Direct Trust — HS256 JWT, TTL 10 phút |
| Lưu trữ | Vercel KV (prod) / file JSON local (dev) |
| Package manager | pnpm (workspaces) cho JS, uv cho Python |

### Bất biến (invariants) quan trọng

- JWT TTL = 10 phút, mint mới mỗi lần load viz. **Một JWT / trang.**
- `TABLEAU_EMBED_USER` env ghi đè `session.user.email` làm `sub` của JWT — cho
  phép user demo (vd `vnpt@demo.com`) nhúng mà không cần là user Tableau thật.
- `USERATTRIBUTE("TenantId")` enforce RLS trong workbook.
- `allowedProjects` trên TenantRecord lọc folder Tableau mỗi portal thấy — áp
  dụng ở **mọi** call site gọi `getLiveCatalog()`, không chỉ ở layout.
- Secrets không bao giờ rời server. URL contract: `/t/[tenantSlug]/...`.

---

## 2. Kiến trúc & luồng dữ liệu

```
apps/web/                     # Next.js portal
  app/
    (auth)/sign-in/page.tsx   # trang đăng nhập + danh sách demo account
    api/
      tableau/token/route.ts  # mint JWT, dùng TABLEAU_EMBED_USER
      admin/seed/route.ts     # POST /api/admin/seed[?force=true] — reset KV baseline
      chat/route.ts           # AI agent turn (gate advisory theo tenant)
    t/[tenantSlug]/
      layout.tsx              # sidebar — load theme + catalog đã lọc
      page.tsx / dashboards/  # trang tenant, danh sách + trang nhúng
  data/
    tenants.json              # baseline TenantRecord (fallback khi KV miss)
    tenant-themes.json        # baseline theme (màu/logo/font)
  lib/
    agent.ts                  # runAgentTurn() — MAX_TOOL_ROUNDS, streaming
    agent-suggestions.ts      # starter-prompt chips theo slug + industry
    tenants.ts / tenant-theme.ts   # KV + file storage, fallback khi KV miss
    tableau-rest.ts           # getLiveCatalog(tenantId, allowedProjects)
  public/tenants/<slug>-logo.png

packages/factory-schema/      # JSON Schema hợp đồng cột (source of truth)
services/factory/
  app/generators/<name>.py    # generator dữ liệu tổng hợp per-industry
  app/schemas/<industry>.schema.json   # mirror của packages/factory-schema
  app/hyper.py                # write_hyper(tables, path)
  scripts/<slug>/             # script provision + build workbook per-tenant
```

**Luồng xem dashboard**: `getTenant(slug)` → `getLiveCatalog(tenantId,
allowedProjects)` → trang nhúng mint JWT (`sub = TABLEAU_EMBED_USER ?? email`) →
`<TableauVizShell>` load CDN + tạo `<tableau-viz>` → khi lỗi auth thì auto
refetch token.

**Luồng lọc catalog**: `allowedProjects` (vd `["Demo/VNPT"]`) → `filterCatalog()`
match theo tên project HOẶC path "Parent/Child" → áp ở **mọi return path**
(cache hit, in-flight, fresh) — nếu không, hai portal cùng site sẽ rò catalog
của nhau.

---

## 3. Hai kỹ thuật dựng dashboard: chọn cái nào

Có **hai đường** để đưa một workbook lên Cloud sao cho nó *render* (không phải
sheet trắng). Chọn theo nhu cầu:

### 3A. Extract-workbook tự chứa (`.twbx`) — **MẶC ĐỊNH, khuyên dùng**

Đóng gói `.hyper` **bên trong** `.twbx`; mỗi bảng là một `<datasource>` riêng
(federated → hyper named-connection). Publish với `skip_connection_check=True`.

- ✅ **KHÔNG cần** "seed block" sqlproxy do Desktop sinh ra.
- ✅ Dựng 100% bằng code, không cần bước thủ công trên Desktop.
- ⚠️ **Luật kiến trúc: MỘT datasource / MỘT bảng.** Mọi sheet là single-table.
  Một datasource liệt kê nhiều `<relation>` sibling KHÔNG join = XML federated
  không hợp lệ → render TRẮNG.
- ⚙️ Vì single-table nên **model dữ liệu phải pre-aggregate**: dựng sẵn các
  bảng fact đã gộp (vd `MonthlyTotals` month-grain, `ProvinceSummary` snapshot)
  để không cần join lúc render. Tên field để trần (không `[Field (Bảng)]`).

Đây là kỹ thuật của **VACS, SHB, VNPT** — dùng cho mọi build mới.

### 3B. Seed-block sqlproxy (đường cũ)

Workbook trỏ tới datasource đã publish qua `sqlproxy`. Cloud cần block
`<datasource>` inline mang ~90+ `<metadata-records>` + `<relation
type='collection'>` mà **chỉ Tableau Desktop sinh ra được**.

- Cần bước thủ công: user tạo 1 workbook Desktop 1-sheet, publish làm
  `_seed_desktop`, tải về, trích block `<datasources>` làm template vàng.
- Cho phép quan hệ đa bảng (join) render đúng — dùng khi buộc phải cross-table
  ở render time.

Đây là đường của **MediaMart, Nam A Bank, Mey Group**. Xem memory
`tableau-cloud-calc-fields-need-metadata`.

> **Quy tắc chọn**: mặc định 3A. Chỉ dùng 3B khi thực sự cần join đa bảng ở
> render time mà không pre-aggregate được.

---

## 4. Quy trình dựng portal mới — 6 phase

### Phase 0 — Nghiên cứu TRƯỚC (đừng bỏ qua)

1. **Nghiên cứu công ty** (fan-out web song song): hồ sơ, sản phẩm, phân khúc
   kinh doanh, màu + logo thương hiệu, quy mô. **Hiệu chỉnh số liệu tổng hợp
   theo con số công bố thật ±5%** (banks: NPL/CASA/LDR/ROE; telecom:
   doanh thu/thuê bao/ARPU/churn/thị phần).
   > ⚠️ Cảnh giác scrape sai: vd VNPT từng bị trả về "doanh thu 211.895 tỷ"
   > (thực ra là Viettel/tích lũy 5 năm). Số đúng ~61.246 tỷ. Luôn cross-check.

2. **Nghiên cứu design** (bắt buộc — user đã flag vụ bỏ qua ở Nam A Bank): query
   Tableau Public tìm workbook VOTD/Ambassador cùng ngành. Đọc sâu 3–5 mẫu về
   layout thẻ KPI, loại chart, dùng màu, phân cấp. **RỒI mới thiết kế.**
   - API public không auth: `https://public.tableau.com/api/search?query=X&count=N`
   - Hoặc MCP `tableau-public` (nếu thêm giữa session thì tool chưa vào
     ToolSearch tới session sau — dùng WebFetch fallback).
   - Ảnh thumbnail: `https://public.tableau.com/thumb/views/<wb>/<sheet>`.

3. **Lấy logo** đúng thật: query Wikipedia API tìm file logo
   (`.../w/api.php?action=query&list=allimages&aiprefix=<Tên>`), tải SVG, **trích
   HEX màu trực tiếp từ SVG** (VNPT blue `#1265b6` lấy từ `fill:` của path),
   rasterize sang PNG bằng `sharp` (có sẵn ở `apps/web/node_modules/sharp`):
   ```js
   sharp(svgBuffer, { density: 900 }).resize({ width: 600 }).png().toFile(out)
   ```
   Lưu vào `apps/web/public/tenants/<slug>-logo.png`.

### Phase 1 — Nền tảng (generator + schema + wiring portal)

1. **Generator** `services/factory/app/generators/<name>.py`:
   - dataclass `<Name>Parameters` + `<Name>Dataset` có `.all_tables()`.
   - Đăng ký trong `generators/__init__.py` (import + `__all__`).
   - Với **đường extract (3A)**: dựng các bảng **pre-aggregate** để mọi sheet
     single-table (vd VNPT: `MonthlyTotals`, `MonthlyService`, `ProvinceSummary`,
     `ChurnReasons` + 2 dim `Services`, `Provinces`).
   - Địa lý VN = tuple tỉnh có trọng số + lat/long thật (jitter σ≈0.012°).
   > ⚠️ `faker.unique.name()` cạn sau vài nghìn dòng — dùng `fake.name()` cho N lớn.

2. **Schema** `packages/factory-schema/<industry>.schema.json` + **mirror**
   `services/factory/app/schemas/<industry>.schema.json`. Một list `required`
   bảng + enum cột mỗi bảng. Đây là hợp đồng cột generator phải khớp 100%.

3. **Wiring tenant + theme** — sửa **tất cả** 6 touchpoint:
   - `apps/web/data/tenants.json` — TenantRecord (slug, industry, sourceUrl,
     `allowedProjects: ["Demo/<Name>"]`).
   - `apps/web/data/tenant-themes.json` — màu (primary/secondary/neutral), logo,
     `logoLayout: "wordmark"`.
   - `apps/web/app/api/admin/seed/route.ts` — thêm vào **cả** `TENANTS` **và**
     `THEMES` (file JSON là baseline; seed ghi KV). Nếu bỏ ở đây, `seed?force`
     sẽ xóa tenant khỏi KV.
   - `apps/web/app/(auth)/sign-in/page.tsx` — thêm `{ email: "<slug>@demo.com",
     role: "<Name>" }` vào danh sách demo.
   - `apps/web/lib/agent-suggestions.ts` — starter chips theo `industry` +
     override theo `slug`.
   - `DEV_USERS_JSON` (local `.env.local` **và** Vercel env cho prod) — thêm
     `{email, password:"dev", tenantId:<slug>, tenantName, groups:[]}`.

> **Kiểm tra**: `npx tsc --noEmit` (typecheck sạch), `industry` là `string` tự do
> — không có enum ràng buộc, nên tên ngành mới (vd `telecom`) chạy khắp nơi.

### Phase 2 — Dữ liệu → Cloud datasource

Script `services/factory/scripts/<slug>/provision_<slug>.py`:

1. `generate_<name>()` → `write_hyper(tables, .hyper)` → gói `.tdsx` (emitter
   `.tds` phẳng, các bảng là `<relation>` sibling — **đừng** hand-author join
   object-model).
2. Tạo project Cloud `Demo/<Name>` qua `tableauserverclient`.
3. Publish `.tdsx` (mode Overwrite).

```bash
cd services/factory
uv run python scripts/<slug>/provision_<slug>.py --publish
```

Env cần (`services/factory/.env`): `TABLEAU_SITE_URL`, `TABLEAU_SITE_NAME`,
`TABLEAU_PAT_NAME`, `TABLEAU_PAT_SECRET`.

> Datasource phẳng này phục vụ **AI agent** (MCP). Với đường extract (3A), các
> **dashboard** dùng workbook `.twbx` tự chứa nên không cần vẽ quan hệ trên
> Desktop. (Với 3B: user mở `.tdsx` trên Desktop, kéo quan hệ, republish — Cloud
> strict-mode chỉ nhận quan hệ do Desktop tạo.)

### Phase 3 — Thư viện dựng workbook (`<slug>_lib.py`)

Clone `services/factory/scripts/vacs/vacs_lib.py` (chuẩn vàng hiện tại) → sửa:
- `_SCHEMA` khớp bảng của bạn; `HYPER` path; `dbname` trong `datasource_block`.
- Design tokens (màu) theo thương hiệu; các palette trong `_PALETTES`.
- `VNPT_PROJECT_ID` = id project `Demo/<Name>` (in ra từ Phase 2).

Thư viện cung cấp primitive đã kiểm chứng trên đường extract:
`kpi_card_delta` (BAN + delta), `sparkline`, `chart` (bar/line ranking),
`emphasis_month_chart` (tháng max đậm nhất), `diverging_month_bar`,
`map_custom`, `donut`, `dashboard` (layout-flow), `workbook`, `package_twbx`,
`publish`, `render`.

### Phase 4 — PROBE trước, rồi mới dựng dashboard

**Kỷ luật quan trọng nhất** (học từ VACS/VNPT): các viz "rủi ro" (map, donut,
diverging color, KPI-card trên đường extract) phải **probe từng cái** trước.

1. Viết `probe_extract.py`: dựng 1 workbook chứa các viz nghi ngờ, để sheet
   **VISIBLE** (bỏ `hidden='true'`) để mỗi sheet lộ thành REST view, publish,
   `views.populate_image(maxage=1)` → đọc PNG.
2. Xem PNG, chốt cái nào work.

**Kết quả probe VNPT (tham chiếu cho lần sau):**

| Viz | Kết quả | Ghi chú |
|---|---|---|
| `map_custom` (Lat/Lon tự có làm geo field) | ✅ | Một dot/tỉnh, đúng vị trí VN. **Dùng cái này.** |
| `map_geocoded` (geocode theo tên tỉnh) | ❌ | Bản đồ thế giới trắng — tên tỉnh VN không resolve. |
| Pie/donut | ⚠️ | Render nhưng chật, label bị cắt → thay bằng **ranked bar**. |
| Diverging bar tô màu theo **dimension** | ❌ | Không bind, rơi về cam mặc định. |
| Diverging bar tô màu theo **measure** `SIGN()` | ✅ | Measure pill bind được. **Dùng cái này.** |

3. Dựng `build_<slug>_dashboard.py`: template datasource-block + inject calc +
   worksheet + 1 dashboard layout-flow. Dùng zone-id counter tuần tự (id hash
   trùng → chồng zone).

**Quy tắc authoring (đúc kết):**
- **Công thức dùng nháy KÉP**: `[Status] = "X"` (nháy đơn → NULL). XML-escape
  `"`→`&quot;`, `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`.
- **Format số — thứ tự dấu phẩy scaling**: `#,##0,,,.1` (÷1e9, 1 dp — chữ *tỷ*)
  hoặc `#,##0,,.1` (÷1e6 — *triệu*). Dấu phẩy đặt SAU dấu chấm (`.0,,`) bị **bỏ
  qua** → hiện số thô. (Bug "05.526,0 triệu" của VNPT do lỗi này.) Tiền tệ dùng
  prefix `n`, KHÔNG dùng `c!vi_VN!` (renderer gạch chân glyph ₫).
- **Đếm bị fan-out qua quan hệ**: dùng calc `COUNTD([Key])` thay cho instance
  `[cnt:Key]` thô (calc miễn nhiễm fan-out).
- **Màu theo dimension KHÔNG bind** trong .twb hand-author (rơi về cam mặc
  định) → tô màu qua **MEASURE pill** + palette (vd `SIGN(SUM([x]))` cho diverging,
  hoặc sequential palette trên measure để "highlight max").
- **Map**: dùng cột Lat/Lon **tự có** làm geo field (`semantic-role
  [Latitude].[Latitude]` / `[Longitude].[Longitude]`, AVG trên rows/cols, dim
  trên `<lod>`). Geocode theo tên tỉnh VN **thất bại**.
- **KPI card trên đường extract**: đặt measure trên `<rows>` + `mark
  class='Text'` (rows/cols rỗng render trắng trong cell dashboard).
- **layout-flow bỏ qua `w=`**: một horizontal flow chia đều các con. Muốn chart
  rộng hơn → cho nó một hàng riêng hoặc nest flow.
- **Sizing**: 6 KPI ngang 1600px → value fontsize ~17 (22 tràn/cắt chữ).
- **Ẩn tab worksheet** (yêu cầu cố định): mọi `<window class='worksheet'>` thêm
  `hidden='true'`; chỉ window dashboard hiện.

### Phase 5 — Publish + verify + seed

```bash
uv run python scripts/<slug>/build_<slug>_dashboard.py --publish
```

- Publish workbook (Overwrite, `skip_connection_check=True`).
- Nếu Cloud từ chối 400011 "newer version": hạ `source-build` xuống 2026.1.1.
- **Render mỗi view** qua `views.populate_image(ImageRequestOptions(maxage=1))`
  (bypass cache render) → **đọc PNG để mắt thấy** trước khi báo xong.
- Dọn workbook probe khỏi Cloud (nhớ `tsc.Pager` để paginate — `get()` chỉ trả
  100 item đầu).
- **Seed tenant**: đăng nhập internal trên bản deploy → `GET
  /api/admin/seed?force=true` (warm KV + invalidate catalog cache). File JSON là
  fallback nên tenant vẫn hiện sau deploy dù chưa seed.

### Phase 6 — Extensions (tùy chọn, "wow-moment")

Dashboard extension nằm ở `apps/web/public/extensions/<name>/`
(`.trex`+`.html`+`.css`+`.js`), serve static từ portal, same-origin với
`/api/chat` để cookie session xác thực.
> Middleware phải cho `/extensions/` public (Cloud fetch manifest không kèm
> cookie). Một lần: thêm origin portal vào Extensions safe-list của site.

---

## 5. Bảng cạm bẫy Tableau Cloud strict-mode

| # | Cạm bẫy | Cách xử lý |
|---|---|---|
| 1 | Workbook sqlproxy bare → sheet trắng | Cần seed block Desktop (~90 metadata-records) **hoặc** dùng extract-workbook 3A |
| 2 | Datasource extract nhiều `<relation>` không join → trắng | **Một datasource / một bảng**; pre-aggregate để single-table |
| 3 | Quan hệ đa bảng hand-author bị Cloud từ chối | Chỉ quan hệ do Desktop UI tạo mới pass |
| 4 | Công thức nháy đơn → NULL | Dùng nháy kép + XML-escape |
| 5 | Màu theo dimension không bind (rơi về cam) | Tô màu qua measure pill + palette |
| 6 | Geocode tên tỉnh VN thất bại | Dùng cột Lat/Lon tự có làm geo field |
| 7 | Format `.0,,` bị bỏ qua → số thô | Dấu phẩy scaling đặt trước dấu chấm: `#,##0,,.1` |
| 8 | KPI card trắng trong cell dashboard | Measure trên `<rows>` + `mark class='Text'` |
| 9 | 400011 "newer version" | Hạ `source-build` → 2026.1.1 |
| 10 | Ảnh render bị cache | `ImageRequestOptions(maxage=1)` hoặc filter `vf()` |
| 11 | Đếm bị fan-out qua quan hệ | Calc `COUNTD([Key])` thay instance thô |
| 12 | `get()` chỉ trả 100 item khi dọn dẹp | Dùng `tsc.Pager(server.workbooks)` |

---

## 6. Checklist đầu-cuối

```
Phase 0 — Nghiên cứu
  [ ] Hồ sơ công ty + số KPI thật (±5%), cross-check scrape sai
  [ ] Design research 3–5 workbook VOTD cùng ngành
  [ ] Logo thật → HEX từ SVG → PNG (sharp) → public/tenants/<slug>-logo.png

Phase 1 — Nền tảng
  [ ] generators/<name>.py (pre-aggregate nếu đi đường extract) + đăng ký __init__
  [ ] packages/factory-schema/<industry>.schema.json + mirror app/schemas/
  [ ] tenants.json + tenant-themes.json
  [ ] seed/route.ts (CẢ TENANTS lẫn THEMES)
  [ ] sign-in/page.tsx (demo account)
  [ ] agent-suggestions.ts (industry + slug)
  [ ] DEV_USERS_JSON (local .env.local + Vercel env)
  [ ] npx tsc --noEmit sạch; contract self-check generator == schema

Phase 2 — Datasource
  [ ] provision_<slug>.py --publish → project Demo/<Name> + datasource id

Phase 3–4 — Workbook
  [ ] <slug>_lib.py (clone vacs_lib, sửa schema/màu/project id)
  [ ] PROBE các viz rủi ro (sheet visible) → đọc PNG → chốt
  [ ] build_<slug>_dashboard.py

Phase 5 — Publish + verify
  [ ] publish (skip_connection_check=True)
  [ ] render mỗi view → mắt thấy PNG OK
  [ ] xóa workbook probe (dùng Pager)
  [ ] seed KV: /api/admin/seed?force=true (internal, trên deploy)
  [ ] cập nhật memory <slug>-tenant.md + MEMORY.md
```

---

## 7. Tenant tham chiếu & tài sản tái dùng

| Tenant | Ngành | Kỹ thuật | Ghi chú |
|---|---|---|---|
| **VNPT** | telecom | Extract 3A | Control-tower điều hành; map_custom, diverging measure, 6 pre-agg tables |
| **VACS** | airline-catering | Extract 3A | **Nguồn gốc** kỹ thuật extract-workbook; 6 dashboard QA |
| **SHB** | sme-corporate-banking | Extract 3A | 1 dashboard + AI advisory campaign per-ngành |
| **MediaMart** | retail-mediamart | Seed-block 3B | Control Tower bán lẻ |
| **Nam A Bank** | retail-banking | Seed-block 3B | 4 workbook, hiệu chỉnh NPL/LDR/CASA |
| **Mey Group** | retail-realestate | Seed-block 3B | 5 dashboard CEO; bài học COUNTD fan-out |

**Thư viện gold để clone**: `services/factory/scripts/vacs/vacs_lib.py` (extract),
`services/factory/scripts/vnpt/vnpt_lib.py` (thêm map_custom + diverging measure
+ donut). Skill liên quan: `.claude/skills/new-tenant-portal`,
`.claude/skills/tableau-exec-dashboard`.

**Memory liên quan**: `vnpt-tenant`, `vacs-tenant`, `shb-tenant`,
`tableau-workbook-authoring-pitfalls`, `tableau-cloud-color-binding-and-emphasis`,
`tableau-cloud-calc-fields-need-metadata`, `feedback_design_research_first`.
