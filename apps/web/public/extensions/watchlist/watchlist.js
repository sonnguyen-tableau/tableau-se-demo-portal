/* AI Watchlist dashboard extension — Nam A Bank.
 *
 * Reads at-risk customer rows from a worksheet on the dashboard, renders an
 * HTML table with an inline PD-score bar, lets the user click a row to filter
 * the rest of the dashboard, and click "Giải thích" to stream an AI narrative
 * from the portal's /api/chat endpoint (same-origin session cookie).
 *
 * Expected worksheet columns (case-insensitive match, flexible):
 *   CustomerName | RiskBand | PdScore | TopReason
 * Works against the "AI Watchlist" sheet in the Nam A Bank Rui ro Tin dung wb.
 */
(function () {
  "use strict";

  var COL = { name: null, band: null, pd: null, reason: null, custId: null };
  var currentWorksheet = null;
  var lastRows = [];

  // Portal origin — same origin the .html is served from (Vercel). /api/chat is
  // reachable same-origin so the NextAuth session cookie authenticates the call.
  var PORTAL_ORIGIN = window.location.origin;

  document.addEventListener("DOMContentLoaded", function () {
    tableau.extensions.initializeAsync().then(function () {
      var dashboard = tableau.extensions.dashboardContent.dashboard;
      var worksheets = dashboard.worksheets;

      // Populate worksheet picker; auto-pick one whose name hints at watchlist/risk.
      var select = document.getElementById("worksheet-select");
      worksheets.forEach(function (ws) {
        var opt = document.createElement("option");
        opt.value = ws.name;
        opt.textContent = ws.name;
        select.appendChild(opt);
      });
      var preferred = worksheets.find(function (ws) {
        var n = ws.name.toLowerCase();
        return n.indexOf("watchlist") >= 0 || n.indexOf("rủi ro") >= 0 || n.indexOf("rui ro") >= 0;
      });
      var initialName = preferred ? preferred.name : (worksheets[0] && worksheets[0].name);
      if (initialName) { select.value = initialName; loadWorksheet(initialName); }

      select.addEventListener("change", function () { loadWorksheet(select.value); });
    }).catch(function (err) {
      showError("Không khởi tạo được Extension: " + (err && err.message ? err.message : err));
    });

    document.getElementById("wl-drawer-close").addEventListener("click", function () {
      document.getElementById("wl-drawer").hidden = true;
    });
  });

  function loadWorksheet(name) {
    var dashboard = tableau.extensions.dashboardContent.dashboard;
    currentWorksheet = dashboard.worksheets.find(function (ws) { return ws.name === name; });
    if (!currentWorksheet) return;
    setLoading("Đang tải dữ liệu từ '" + name + "'…");

    currentWorksheet.getSummaryDataAsync({ maxRows: 200, ignoreSelection: true }).then(function (data) {
      mapColumns(data.columns);
      lastRows = data.data.map(function (row) {
        return {
          name: cell(row, COL.name),
          band: cell(row, COL.band),
          pd: parseFloat(cell(row, COL.pd)) || pctToNum(cell(row, COL.pd)),
          reason: cell(row, COL.reason),
        };
      });
      // Keep only genuine at-risk rows if a band column exists; sort by PD desc.
      var filtered = lastRows.filter(function (r) { return r.name; });
      filtered.sort(function (a, b) { return (b.pd || 0) - (a.pd || 0); });
      render(filtered.slice(0, 50));
    }).catch(function (err) {
      showError("Không đọc được dữ liệu: " + (err && err.message ? err.message : err));
    });
  }

  function mapColumns(columns) {
    COL = { name: null, band: null, pd: null, reason: null };
    columns.forEach(function (c) {
      var f = (c.fieldName || "").toLowerCase();
      var i = c.index;
      if (COL.name === null && (f.indexOf("customername") >= 0 || f.indexOf("khách") >= 0 || f === "customer name")) COL.name = i;
      else if (COL.band === null && (f.indexOf("riskband") >= 0 || f.indexOf("risk band") >= 0 || f.indexOf("nhóm rủi ro") >= 0)) COL.band = i;
      else if (COL.pd === null && (f.indexOf("pdscore") >= 0 || f.indexOf("pd score") >= 0 || f.indexOf("pd") === 0)) COL.pd = i;
      else if (COL.reason === null && (f.indexOf("topreason") >= 0 || f.indexOf("reason") >= 0 || f.indexOf("lý do") >= 0)) COL.reason = i;
    });
    // Fallbacks: first string col = name, first numeric = pd
    if (COL.name === null && columns[0]) COL.name = 0;
  }

  function cell(row, idx) {
    if (idx === null || idx === undefined || !row[idx]) return "";
    return row[idx].formattedValue != null ? row[idx].formattedValue : (row[idx].value != null ? String(row[idx].value) : "");
  }

  function pctToNum(s) {
    if (!s) return 0;
    var m = String(s).replace(",", ".").match(/([\d.]+)/);
    if (!m) return 0;
    var v = parseFloat(m[1]);
    return v > 1 ? v / 100 : v;
  }

  function render(rows) {
    var tbody = document.getElementById("wl-tbody");
    tbody.innerHTML = "";
    document.getElementById("wl-count").textContent = rows.length + " khách hàng";

    rows.forEach(function (r) {
      var tr = document.createElement("tr");

      // name
      var tdName = document.createElement("td");
      tdName.className = "wl-name";
      tdName.textContent = r.name;
      tr.appendChild(tdName);

      // band
      var tdBand = document.createElement("td");
      var bandKey = normalizeBand(r.band);
      tdBand.innerHTML = '<span class="wl-band wl-band-' + bandKey + '">' + escapeHtml(r.band || bandKey) + "</span>";
      tr.appendChild(tdBand);

      // pd bar
      var tdPd = document.createElement("td");
      tdPd.className = "wl-num";
      var pdPct = Math.max(0, Math.min(1, r.pd || 0));
      var color = pdPct >= 0.7 ? "#B7302B" : pdPct >= 0.5 ? "#c2410c" : pdPct >= 0.3 ? "#a16207" : "#059669";
      tdPd.innerHTML =
        '<div class="wl-pd">' +
        '<span class="wl-pd-val">' + (pdPct).toFixed(2) + "</span>" +
        '<span class="wl-pd-track"><span class="wl-pd-fill" style="width:' + (pdPct * 100).toFixed(0) + "%;background:" + color + '"></span></span>' +
        "</div>";
      tr.appendChild(tdPd);

      // reason
      var tdReason = document.createElement("td");
      tdReason.className = "wl-reason";
      tdReason.textContent = r.reason || "—";
      tr.appendChild(tdReason);

      // AI button
      var tdAi = document.createElement("td");
      tdAi.className = "wl-action";
      var btn = document.createElement("button");
      btn.className = "wl-ai-btn";
      btn.textContent = "Giải thích";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        explainWithAI(r, btn);
      });
      tdAi.appendChild(btn);
      tr.appendChild(tdAi);

      // Row click → filter dashboard by this customer name
      tr.addEventListener("click", function () {
        document.querySelectorAll(".wl-selected").forEach(function (el) { el.classList.remove("wl-selected"); });
        tr.classList.add("wl-selected");
        filterDashboard(r.name);
      });

      tbody.appendChild(tr);
    });

    document.getElementById("wl-loading").hidden = true;
    document.getElementById("wl-table").hidden = false;
  }

  function normalizeBand(b) {
    var s = (b || "").toLowerCase();
    if (s.indexOf("watch") >= 0 || s.indexOf("cảnh báo cao") >= 0) return "Watch";
    if (s.indexOf("high") >= 0 || s.indexOf("cao") >= 0) return "High";
    if (s.indexOf("medium") >= 0 || s.indexOf("trung") >= 0) return "Medium";
    return "Low";
  }

  function filterDashboard(customerName) {
    if (!currentWorksheet || COL.name === null) return;
    // Determine the field name for the name column
    currentWorksheet.getSummaryDataAsync({ maxRows: 1 }).then(function (d) {
      var col = d.columns[COL.name];
      if (!col) return;
      currentWorksheet.applyFilterAsync(col.fieldName, [customerName], tableau.FilterUpdateType.Replace)
        .catch(function () { /* filter field may not be filterable — ignore */ });
    });
  }

  function explainWithAI(row, btn) {
    var drawer = document.getElementById("wl-drawer");
    var content = document.getElementById("wl-drawer-content");
    document.getElementById("wl-drawer-title").textContent = "AI: " + row.name;
    drawer.hidden = false;
    content.innerHTML = '<span class="wl-typing">AI đang phân tích…</span>';
    btn.disabled = true;

    var prompt =
      "Khách hàng " + row.name + " thuộc nhóm rủi ro " + row.band +
      ", điểm PD (probability of default) = " + (row.pd || 0).toFixed(2) +
      ", lý do cảnh báo: \"" + row.reason + "\". " +
      "Hãy giải thích ngắn gọn (3-4 câu) vì sao khách hàng này rủi ro, " +
      "và đề xuất 2 hành động cụ thể cho cán bộ tín dụng Nam A Bank. Trả lời bằng tiếng Việt.";

    fetch(PORTAL_ORIGIN + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message: prompt }),
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return streamSse(res, content);
    }).catch(function (err) {
      content.textContent = "Không gọi được AI: " + (err && err.message ? err.message : err) +
        "\n\n(Extension phải chạy trong portal đã đăng nhập để dùng /api/chat.)";
    }).finally(function () { btn.disabled = false; });
  }

  // Parse the SSE stream from /api/chat, appending text_delta events.
  function streamSse(res, contentEl) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buf = "";
    var acc = "";
    contentEl.textContent = "";
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += decoder.decode(r.value, { stream: true });
        var lines = buf.split("\n");
        buf = lines.pop();
        lines.forEach(function (line) {
          line = line.trim();
          if (line.indexOf("data:") !== 0) return;
          var json = line.replace(/^data:\s*/, "");
          if (!json) return;
          try {
            var evt = JSON.parse(json);
            if (evt.type === "text_delta" && evt.delta) {
              acc += evt.delta;
              contentEl.textContent = acc;
              contentEl.scrollTop = contentEl.scrollHeight;
            }
          } catch (e) { /* ignore non-JSON keepalive */ }
        });
        return pump();
      });
    }
    return pump();
  }

  function setLoading(msg) {
    var l = document.getElementById("wl-loading");
    l.hidden = false;
    l.textContent = msg;
    document.getElementById("wl-table").hidden = true;
  }

  function showError(msg) {
    var l = document.getElementById("wl-loading");
    l.hidden = false;
    l.textContent = msg;
    l.style.color = "#B7302B";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
