# Talk Track V2 — Demo Tableau · Báo Cáo Chung Tình Hình Kinh Doanh Mey Group

> Viết lại theo bộ dashboard **D1→D5 V1** đã hoàn thiện trên Tableau Cloud
> (site `vietnam`, project **Demo/Mey Group**). Mọi con số khớp với bản LIVE.
> Thay cho bản talk-track gốc (`Talk Track — Demo Tableau … .pdf`).

## 🎬 Tổng Quan

**Tổng thời lượng:** ~15 phút · **Cấu trúc:** Opening (1′) → Dashboard Tour (8′) → AI Deep Dive (5′) → Close (1′)

**Mục tiêu:** Giúp CEO **Nguyễn Duy Chính** thấy Tableau là *"màn hình điều hành số duy nhất"* — nhìn toàn bộ sức khỏe tập đoàn, drill-down theo từng mảng, và ra quyết định bằng dữ liệu.

**Điểm mới của bộ V1 (nhấn mạnh khi demo):**
- **Sparkline dưới mỗi thẻ KPI** — nhìn 1 giây thấy ngay xu hướng 6 tháng, không cần mở thêm chart.
- **Biểu đồ theo tháng "nhấn cột cao nhất"** — tháng đỉnh tô đậm nhất, kèm **vạch vàng = mục tiêu KPI** từng tháng → đạt/chưa-đạt hiện ngay.
- **Vạch mục tiêu (target line)** trên các bảng xếp hạng (tiến độ 85%, chuyển đổi 7%) → biết ngay ai trên/dưới chuẩn.

---

## 🎤 OPENING (1 phút)

> *"Thưa CEO — anh đang nhận báo cáo từ hàng chục nguồn khác nhau, mỗi nguồn một format, mỗi con số một thời điểm. Hôm nay tôi đặt vào tay anh **một màn hình duy nhất** — nhìn là thấy, hỏi là có ngay câu trả lời. Bắt đầu."*

👉 Mở **Mey Group Executive Dashboard** — toàn tập đoàn (6 dự án đang bán + Ciel sắp mở).

---

## 📊 PHẦN I — DASHBOARD TOUR (8 phút)

> *"5 dashboard — 5 góc nhìn — toàn bộ sức khỏe tập đoàn H1-2026."*

### 🏦 Dashboard 1 — Tài Chính (1,5′) · `Mey Group - Tai Chinh V1`

> *"Sản lượng, doanh số, dòng tiền, công nợ — toàn tập đoàn trên một màn hình, cập nhật real-time."*

- **4 thẻ KPI + ring %HT:** Sản lượng **2.335 căn** (▲102% KHNS · 90% KPI) · Doanh số **24.220 tỷ** (▲101% · 89%) · Tiền thu **17.819 tỷ** (98% · 87%) · Công nợ phải thu **6.401 tỷ**.
- **Biểu đồ theo tháng** — chỉ vào cột **Tháng 6 (497 căn / 5.135 tỷ)** tô đậm nhất: *"Tháng 6 là đỉnh — còn vạch vàng phía trên mỗi cột là **mục tiêu KPI**. Anh thấy ngay T1–T4 dưới mục tiêu, T5–T6 bám sát."*
- **Câu chốt:** *"Doanh số dồn vào **Meyhomes Capital Phú Quốc — 14.810 tỷ**, chiếm ~61%. Công nợ cũng tập trung ở đó (3.757 tỷ) nhưng 96% **chưa đến hạn** — rủi ro thấp."*

### 📈 Dashboard 2 — Kinh Doanh & Phễu (2′) · `Mey Group - Kinh Doanh Pheu V1`

> *"Phễu kinh doanh toàn tập đoàn — Lead → NET → Visit → Booking → Deal — tự động tính chuyển đổi từng bước."*

- **5 thẻ KPI có sparkline:** Tổng Leads **29.358** · Booking **4.218** · Deal **2.335** (▲102% KHNS) · Tỷ lệ chốt **8,0%** · Lost **1.504**. *"Nhìn đường xu hướng dưới mỗi số: Leads/Booking/Deal đều đi lên, nhưng **Tỷ lệ chốt đang chững lại** và **Lost đang nhích lên** — tín hiệu cần theo dõi."*
- **Phễu:** Lead **9.041** → Visit 6.473 → NET 5.847 → Booking 4.218 → Deal. **Nguồn khách:** Referral **7.155** dẫn đầu (>24%).
- **Deal theo Tháng** (nhấn cột T6 + vạch KPI): *"Tháng nào chạm vạch vàng là đạt kế hoạch."*
- **Câu chốt:** *"Nhà đầu tư chiếm **1.269 deal** (>54%), sản phẩm 2PN bán chạy nhất (733). Đây là chân dung khách mua Mey."*

### 🏗️ Dashboard 3 — Dự Án & Gói Thầu (1,5′) · `Mey Group - Du An Goi Thau V1`

> *"42 gói thầu toàn tập đoàn: xanh = đúng tiến độ, đỏ = chậm. Và ngay cạnh — phòng ban nào đang gây tắc."*

- **5 KPI:** Tổng gói **42** · Hoàn thành 7 · **Chậm tiến độ 13** · Tiến độ TB **64%** · Tổng tuần chậm **33**.
- **Tiến độ TB theo Dự án + vạch mục tiêu 85%:** *"Chỉ **Meyhomes Thanh Chương (88%)** vượt mục tiêu — 6 dự án còn lại đều dưới vạch vàng, đặc biệt **Meypearl Ciel 47%**."*
- **Accountability:** *"Bộ phận gây tắc nhiều nhất là **Mua hàng (7 gói)** rồi Kỹ thuật (3). Gói chậm nhất nằm ở Meypearl Ciel (9 tuần). Rõ ràng — không cần họp truy trách nhiệm."*

### 👥 Dashboard 4 — Nhân Sự (1,5′) · `Mey Group - Nhan Su V1`

> *"Quỹ lương, KPI phòng ban, nghỉ việc, tuyển dụng — một màn hình, có sparkline xu hướng từng chỉ số."*

- **5 KPI có sparkline:** Headcount **52** · Quỹ lương **62 tỷ** · **Tỷ lệ nghỉ việc 2,7%** · KPI hoàn thành **80%** · Tuyển mới **96**.
- **Điểm nóng:** *"Nhìn sparkline **Tỷ lệ nghỉ việc — đường dốc lên rõ**. Drill xuống 'theo Bộ phận': **Kinh doanh 4,0%** cao nhất, đúng lúc T5–T6. Tín hiệu sớm để giữ người, không đợi cả team rời đi."*
- KPI hoàn thành: Vận hành **86%** dẫn đầu, **Mua hàng 74%** thấp nhất (trùng khớp bộ phận gây tắc gói thầu ở D3 — một câu chuyện xuyên suốt).

### 🤝 Dashboard 5 — Kênh Đại Lý (1,5′) · `Mey Group - Kenh Dai Ly V1`

> *"8 sàn giao dịch xếp hạng theo doanh số & hiệu quả — real-time."*

- **5 KPI:** Số sàn **8** · Leads giới thiệu **10.728** · Deal qua sàn **728** · Doanh số qua sàn **9.952 tỷ** · Ngân sách hỗ trợ **467 tỷ**.
- **Doanh số theo sàn:** **CEN 2.224 tỷ** dẫn đầu (đậm nhất), thấp nhất VLand 468 tỷ.
- **Tỷ lệ chuyển đổi + vạch mục tiêu 7%:** *"Câu hỏi CEO luôn muốn biết — chỉ **CEN (10,2%), Âu Lạc & Euro (8,4%)** vượt chuẩn; **BTB (3,7%), FTN (4,4%)** kéo cả kênh xuống."*
- **Câu chốt (biểu đồ tương quan):** *"Sàn nhận nhiều hỗ trợ nhất có phải hiệu quả nhất không? Nhìn scatter — **KHÔNG có tương quan**. Ngân sách hỗ trợ đang không mua được hiệu quả. Đây là chỗ tối ưu ngay."*

---

## 🤖 PHẦN II — AI DEEP DIVE: MEY PEARL CIEL (5 phút) · `Mey Group - Ciel Deep Dive`

> *"Anh vừa thấy toàn bộ bức tranh. Giờ — hỏi AI thẳng vào dự án nóng nhất: **Mey Pearl Ciel** (đang giai đoạn Rumor, kickoff 25/06). CEO gõ thẳng câu hỏi vào Tableau AI — không mở file khác, không hỏi ai."*

### 💬 Q1 — "Pipeline Ciel đang ở đâu?"

**AI:** *"**6.550 leads** đã vào phễu Ciel. Phễu: Lead 3.200 → NET 1.400 → Visit 900 → **Booking 780** → Deal 60 (Lost 210). Vì mới mở bán nên phần lớn còn ở đầu phễu — booking mạnh nhưng deal ký chính thức mới 60 (HĐMB dự kiến Q1/2027). Nguồn dẫn đầu: **Referral 1.581 + Event 1.474**. Sàn mạnh nhất: **CEN (1.924) và TTG (1.647)** — chiếm >50% lead giới thiệu."*

### 💬 Q2 — "Nếu giảm giá 5% thì sao?" (What-If)

**AI (mô phỏng):** *"Giá TB hiện ~2,8–3,0 tỷ/căn, tỷ lệ Booking→Deal đang **7,7%** (60/780). Kịch bản -5% để kích chuyển đổi:*
- *+5pp (→13%): ~99 deal, doanh số ký ~**263 tỷ** (sau -5%)*
- *+8pp (→16%): ~122 deal, ~**325 tỷ***
*So hiện tại 60 deal / ~168 tỷ → -5% giá có thể **+95…157 tỷ** NẾU đòn bẩy chuyển đổi đạt kỳ vọng. ⚠️ Rủi ro: giảm giá ảnh hưởng biên & định vị cao cấp → **nên áp có chọn lọc (early-bird đợt đầu)** thay vì đại trà."*

### 💬 Q3 — "Booking có on-track không?"

**AI:** *"Booking **780 / mục tiêu 1.000 = 78%** (ring gauge trên dashboard). Còn **220 booking** để đạt mục tiêu đợt mở bán — khả thi vì pipeline NET+Visit (2.300) còn dày. ⚠️ Cảnh báo: tỷ lệ Booking→Deal thấp (7,7%) → cần đẩy khâu **chốt**, không chỉ giữ chỗ."*

### 💬 Q4 — "Ba việc nên làm ngay?"

**AI — 3 hành động ưu tiên:**
1. **Tập trung sàn CEN + TTG** (đang tạo >50% pipeline) — ưu tiên hỗ trợ & giỏ hàng cho 2 sàn hiệu quả nhất thay vì dàn đều.
2. **Chiến dịch chuyển Booking→Deal** — 780 booking mới ra 60 deal; chính sách thanh toán/chiết khấu early-bird có thời hạn để ép tiến độ ký HĐMB.
3. **What-if -5% giá có kiểm soát** — áp cho đợt 1 / nhóm booking sắp hết hạn giữ chỗ, đo lực đẩy trước khi mở rộng.

---

## 🎬 CLOSING (1 phút)

> *"Trong 15 phút, anh vừa xem **5 dashboard toàn tập đoàn** và hỏi AI **4 câu hỏi thực tế** về Mey Pearl Ciel — nhận ngay số liệu, dự báo và hành động cụ thể. Đây chính xác là cách CEO điều hành bằng dữ liệu mỗi buổi sáng. **Tableau + Salesforce AI — real-time, mọi lúc, mọi nơi."**

---

## 🗒️ Bảng Tóm Tắt Demo Sequence

| # | Phần | Nội dung chính (số liệu LIVE) | Thời lượng |
|---|---|---|---|
| — | Opening | Vấn đề hiện tại → 1 màn hình duy nhất | 1′ |
| 1 | D1 Tài Chính | 2.335 căn · 24.220 tỷ · công nợ 6.401 tỷ · **cột T6 + vạch KPI** | 1,5′ |
| 2 | D2 Kinh Doanh | **Sparkline KPI** · phễu Lead 9.041→Deal · Referral 7.155 · tỷ lệ chốt 8% | 2′ |
| 3 | D3 Dự Án | 42 gói · 13 chậm · **vạch mục tiêu 85%** · Mua hàng gây tắc | 1,5′ |
| 4 | D4 Nhân Sự | **Sparkline KPI** · nghỉ việc 2,7% dốc lên (Kinh doanh 4,0%) | 1,5′ |
| 5 | D5 Đại Lý | 8 sàn · CEN 10,2% · **vạch mục tiêu 7%** · hỗ trợ ≠ hiệu quả | 1,5′ |
| 6 | AI Q1 | Ciel 6.550 leads · booking 780 · CEN+TTG >50% | 1′ |
| 7 | AI Q2 | What-If -5% giá → +95…157 tỷ (có điều kiện) | 1′ |
| 8 | AI Q3 | Booking 780/1.000 = 78%, cần đẩy khâu chốt | 1′ |
| 9 | AI Q4 | 3 hành động → tập trung CEN/TTG, chốt deal, -5% chọn lọc | 1,5′ |
| — | Closing | Tổng kết 1 câu | 1′ |
| | **Tổng** | | **~15 phút** |

---

### Ghi chú vận hành demo
- Thứ tự mở workbook: `Tai Chinh V1` → `Kinh Doanh Pheu V1` → `Du An Goi Thau V1` → `Nhan Su V1` → `Kenh Dai Ly V1` → `Ciel Deep Dive`.
- Điểm "wow" cần chỉ tay: (1) sparkline dưới KPI D2/D4, (2) cột tháng đậm dần + vạch KPI vàng D1/D2, (3) vạch mục tiêu 85%/7% D3/D5, (4) scatter "hỗ trợ ≠ hiệu quả" D5.
- 4 câu hỏi Ciel: nội dung khớp `CIEL_AI_QA.md` (đã reconcile với dashboard LIVE).
