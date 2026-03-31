(function setupDashboard() {
  const REFRESH_MS = 5000;
  const client = typeof ApiClient !== "undefined"
    ? ApiClient
    : {
        getToken: () => localStorage.getItem("token"),
        clearSession: () => {
          localStorage.removeItem("token");
          localStorage.removeItem("role");
        },
        request: async (url, options = {}) => {
          const headers = { ...(options.headers || {}) };
          const token = localStorage.getItem("token");
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          const response = await fetch(url, { ...options, headers });
          const contentType = response.headers.get("content-type") || "";
          const isJson = contentType.includes("application/json");
          const payload = isJson ? await response.json() : null;
          if (response.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("role");
            throw new Error("UNAUTHORIZED");
          }
          if (!response.ok) {
            throw new Error(payload?.detail || payload?.message || `HTTP ${response.status}`);
          }
          return payload;
        },
      };
  const state = {
    profile: null,
    items: [],
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function safeNumber(value) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function drawLineChart(canvasId, values, color, maxY, options) {
    const canvas = byId(canvasId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const unit = (options && options.unit) || "";
    const title = (options && options.title) || "";

    const W = canvas.clientWidth || 760;
    const H = Number(canvas.getAttribute("height") || "180");
    canvas.width = W;
    canvas.height = H;

    const PAD_LEFT = 52;
    const PAD_RIGHT = 14;
    const PAD_TOP = title ? 24 : 10;
    const PAD_BOTTOM = 10;
    const cW = W - PAD_LEFT - PAD_RIGHT;
    const cH = H - PAD_TOP - PAD_BOTTOM;

    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, W, H);

    const clean = values
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map(Number);
    const yMax = maxY != null ? maxY : (clean.length ? Math.max(...clean, 1) : 1);

    function fmtVal(v) {
      const n = unit === "%" || yMax >= 100 ? Math.round(v) : yMax >= 10 ? v.toFixed(1) : v.toFixed(2);
      return unit === "%" ? `${n}%` : unit ? `${n} ${unit}` : String(n);
    }

    if (title) {
      ctx.fillStyle = "#999";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "left";
      ctx.fillText(title, PAD_LEFT + 2, 16);
    }

    for (let i = 0; i <= 4; i += 1) {
      const ratio = i / 4;
      const y = PAD_TOP + cH * (1 - ratio);
      ctx.strokeStyle = "#242424";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(W - PAD_RIGHT, y);
      ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.font = "10px Arial";
      ctx.textAlign = "right";
      ctx.fillText(fmtVal(ratio * yMax), PAD_LEFT - 4, y + 3.5);
    }

    if (!clean.length) {
      ctx.fillStyle = "#555";
      ctx.font = "13px Arial";
      ctx.textAlign = "left";
      ctx.fillText("Aucune donnee", PAD_LEFT + 10, PAD_TOP + cH / 2 + 5);
      return;
    }

    const xStep = clean.length <= 1 ? cW : cW / (clean.length - 1);
    const xOf = (i) => PAD_LEFT + xStep * i;
    const yOf = (v) => PAD_TOP + cH - (v / yMax) * cH;

    const grad = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + cH);
    grad.addColorStop(0, `${color}33`);
    grad.addColorStop(1, `${color}00`);
    ctx.beginPath();
    clean.forEach((v, i) => {
      if (i === 0) ctx.moveTo(xOf(i), yOf(v));
      else ctx.lineTo(xOf(i), yOf(v));
    });
    ctx.lineTo(xOf(clean.length - 1), PAD_TOP + cH);
    ctx.lineTo(xOf(0), PAD_TOP + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    clean.forEach((v, i) => {
      if (i === 0) ctx.moveTo(xOf(i), yOf(v));
      else ctx.lineTo(xOf(i), yOf(v));
    });
    ctx.stroke();

    const lv = clean[clean.length - 1];
    const lx = xOf(clean.length - 1);
    const ly = yOf(lv);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 11px Arial";
    ctx.textAlign = lx > W - 72 ? "right" : "left";
    ctx.fillText(fmtVal(lv), lx + (lx > W - 72 ? -7 : 7), ly - 6);
  }

  function showSection(section) {
    const names = ["precision", "speed", "cpu", "ram", "contacts", "cgu"];
    names.forEach((name) => {
      const el = byId(`${name}-section`);
      if (el) {
        if (name !== section) {
          el.style.display = "none";
          el.style.flexDirection = "";
          el.style.alignItems = "";
        } else {
          el.style.display = "flex";
          el.style.flexDirection = "column";
          el.style.alignItems = "center";
        }
      }
    });
  }

  function setText(id, text) {
    const el = byId(id);
    if (el) {
      el.textContent = text;
    }
  }

  function avg(values) {
    const valid = values.filter((v) => v !== null);
    if (!valid.length) {
      return "-";
    }
    const total = valid.reduce((sum, value) => sum + value, 0);
    return (total / valid.length).toFixed(3);
  }

  async function loadProfile() {
    if (!client.getToken()) {
      window.location.href = "connexion.html";
      return false;
    }

    try {
      const profile = await client.request("/api/me");
      state.profile = profile;
      setText("user-badge", `${profile.email} (${profile.role})`);
      const fullName = (profile.full_name || "").trim() || `${profile.firstname || ""} ${profile.lastname || ""}`.trim() || "-";
      setText("user-fullname", fullName);
      const adminLink = byId("admin-link");
      if (adminLink) {
        adminLink.style.display = profile.role === "admin" ? "inline-flex" : "none";
      }
      return true;
    } catch (error) {
      client.clearSession();
      window.location.href = "connexion.html";
      return false;
    }
  }

  function renderCharts() {
    const pytorch = state.items.filter((item) => item.trainer_name === "pytorch");
    const tensorflow = state.items.filter((item) => item.trainer_name === "tensorflow");
    const ZERO_SERIES_POINTS = 60;

    const toAcc = (items) => items.map((item) => {
      const v = safeNumber(item.accuracy);
      return v !== null ? v * 100 : null;
    });
    const toLatency = (items) => items.map((item) => safeNumber(item.latency_ms));
    const toThroughput = (items) => items.map((item) => safeNumber(item.throughput));
    const toCpu = (items) => items.map((item) => safeNumber(item.cpu_percent));
    const toRam = (items) => items.map((item) => safeNumber(item.ram_percent));
    const zeroSeries = (size) => Array.from({ length: size }, () => 0);

    drawLineChart("precision-chart-pytorch", toAcc(pytorch), "#3ea6ff", 100, { unit: "%", title: "Accuracy" });
    drawLineChart("precision-chart-tensorflow", toAcc(tensorflow), "#3ea6ff", 100, { unit: "%", title: "Accuracy" });

    drawLineChart("speed-chart-pytorch", toLatency(pytorch), "#20c997", null, { unit: "ms", title: "Latence par batch" });
    drawLineChart("speed-chart-tensorflow", toLatency(tensorflow), "#20c997", null, { unit: "ms", title: "Latence par batch" });

    if (state.profile && state.profile.role === "admin") {
      setText("cpu-access-msg", "Visible uniquement pour admin. Donnees hote live.");
      setText("ram-access-msg", "Visible uniquement pour admin. Donnees hote live.");
      drawLineChart("cpu-chart-pytorch", toCpu(pytorch), "#ff8c42", 100, { unit: "%", title: "CPU" });
      drawLineChart("cpu-chart-tensorflow", toCpu(tensorflow), "#ff8c42", 100, { unit: "%", title: "CPU" });
      drawLineChart("ram-chart-pytorch", toRam(pytorch), "#ffd43b", 100, { unit: "%", title: "RAM" });
      drawLineChart("ram-chart-tensorflow", toRam(tensorflow), "#ffd43b", 100, { unit: "%", title: "RAM" });
    } else {
      setText("cpu-access-msg", "Acces refuse: seul un admin peut visualiser CPU.");
      setText("ram-access-msg", "Acces refuse: seul un admin peut visualiser RAM.");
      const fakeSeries = zeroSeries(ZERO_SERIES_POINTS);
      drawLineChart("cpu-chart-pytorch", fakeSeries, "#ff8c42", 100, { unit: "%", title: "CPU" });
      drawLineChart("cpu-chart-tensorflow", fakeSeries, "#ff8c42", 100, { unit: "%", title: "CPU" });
      drawLineChart("ram-chart-pytorch", fakeSeries, "#ffd43b", 100, { unit: "%", title: "RAM" });
      drawLineChart("ram-chart-tensorflow", fakeSeries, "#ffd43b", 100, { unit: "%", title: "RAM" });
    }

    setText("speed-latency-pytorch", avg(toLatency(pytorch)));
    setText("speed-latency-tensorflow", avg(toLatency(tensorflow)));
    setText("speed-throughput-pytorch", avg(toThroughput(pytorch)));
    setText("speed-throughput-tensorflow", avg(toThroughput(tensorflow)));
  }

  async function refreshMetrics() {
    try {
      const isAdmin = state.profile && state.profile.role === "admin";
      const query = isAdmin ? "/api/metrics/live?limit=60&include_system=true" : "/api/metrics/live?limit=60";
      const payload = await client.request(query);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      state.items = items;

      setText("home-status", "ok");
      setText("home-count", String(items.length));
      setText("global-last-refresh", `Dernier rafraichissement: ${new Date().toLocaleTimeString()}`);

      const latest = items.length ? items[items.length - 1] : null;
      setText("home-last-trainer", latest?.trainer_name || "-");
      setText("home-last-accuracy", latest?.accuracy !== undefined && latest?.accuracy !== null ? Number(latest.accuracy).toFixed(4) : "-");
      setText("precision-meta", latest ? `Dernier point: ${new Date(latest.created_at).toLocaleString()}` : "Aucune metrique live");

      renderCharts();
    } catch (error) {
      if (error.message === "UNAUTHORIZED") {
        client.clearSession();
        window.location.href = "connexion.html";
        return;
      }
      setText("home-status", `erreur: ${error.message}`);
      state.items = [];
      renderCharts();
    }
  }

  function bindNavigation() {
    const mapping = {
      "nav-precision": "precision",
      "nav-speed": "speed",
      "nav-cpu": "cpu",
      "nav-ram": "ram",
      "nav-contacts": "contacts",
      "nav-cgu": "cgu",
    };

    Object.entries(mapping).forEach(([buttonId, section]) => {
      const button = byId(buttonId);
      if (button) {
        button.addEventListener("click", () => showSection(section));
      }
    });
  }

  function bindActions() {
    const logoutButton = byId("connexion");
    if (logoutButton) {
      logoutButton.addEventListener("click", () => {
        client.clearSession();
        window.location.href = "connexion.html";
      });
    }

    const refreshButton = byId("user-refresh-btn");
    if (refreshButton) {
      refreshButton.addEventListener("click", refreshMetrics);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bindNavigation();
    bindActions();
    showSection("precision");

    const ok = await loadProfile();
    if (!ok) {
      return;
    }

    await refreshMetrics();
    setInterval(refreshMetrics, REFRESH_MS);
  });
})();
