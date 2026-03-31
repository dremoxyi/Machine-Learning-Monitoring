document.addEventListener("DOMContentLoaded", async () => {
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
  const adminMeta = document.getElementById("admin-meta");
  const apiStatus = document.getElementById("admin-api-status");
  const count = document.getElementById("admin-count");
  const lastTrainer = document.getElementById("admin-last-trainer");
  const lastUpdate = document.getElementById("admin-last-update");
  const tbody = document.getElementById("admin-metrics-tbody");
  const empty = document.getElementById("admin-empty");

  function fmtNumber(value, digits) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "-";
    }
    return Number(value).toFixed(digits);
  }

  function fmtDate(value) {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
  }

  function logout() {
    client.clearSession();
    window.location.href = "connexion.html";
  }

  function drawLineChart(canvasId, values, color, maxY, options) {
    const canvas = document.getElementById(canvasId);
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
    const H = Number(canvas.getAttribute("height") || "170");
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

  function renderLive(items) {
    if (!tbody || !empty) {
      return;
    }

    if (!items.length) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";
    tbody.innerHTML = items
      .slice(-20)
      .map(
        (item) => `
        <tr>
          <td>${fmtDate(item.created_at)}</td>
          <td>${item.trainer_name || "-"}</td>
          <td>${item.dataset_name || "-"}</td>
          <td>${item.step ?? "-"}</td>
          <td>${fmtNumber(item.loss, 4)}</td>
          <td>${fmtNumber(item.accuracy, 4)}</td>
          <td>${fmtNumber(item.latency_ms, 2)}</td>
          <td>${fmtNumber(item.throughput, 2)}</td>
          <td>${fmtNumber(item.cpu_percent, 1)}</td>
          <td>${fmtNumber(item.ram_percent, 1)}</td>
        </tr>
      `
      )
      .join("");

    const pytorch = items.filter((item) => item.trainer_name === "pytorch");
    const tensorflow = items.filter((item) => item.trainer_name === "tensorflow");

    const toAcc = (rows) => rows.map((item) => item.accuracy != null ? item.accuracy * 100 : null);
    const toLatency = (rows) => rows.map((item) => item.latency_ms);
    const toCpu = (rows) => rows.map((item) => item.cpu_percent);
    const toRam = (rows) => rows.map((item) => item.ram_percent);

    drawLineChart("admin-accuracy-chart-pytorch", toAcc(pytorch), "#3ea6ff", 100, { unit: "%", title: "Accuracy" });
    drawLineChart("admin-accuracy-chart-tensorflow", toAcc(tensorflow), "#3ea6ff", 100, { unit: "%", title: "Accuracy" });
    drawLineChart("admin-speed-chart-pytorch", toLatency(pytorch), "#20c997", null, { unit: "ms", title: "Latence par batch" });
    drawLineChart("admin-speed-chart-tensorflow", toLatency(tensorflow), "#20c997", null, { unit: "ms", title: "Latence par batch" });
    drawLineChart("admin-cpu-chart-pytorch", toCpu(pytorch), "#ff8c42", 100, { unit: "%", title: "CPU" });
    drawLineChart("admin-cpu-chart-tensorflow", toCpu(tensorflow), "#ff8c42", 100, { unit: "%", title: "CPU" });
    drawLineChart("admin-ram-chart-pytorch", toRam(pytorch), "#ffd43b", 100, { unit: "%", title: "RAM" });
    drawLineChart("admin-ram-chart-tensorflow", toRam(tensorflow), "#ffd43b", 100, { unit: "%", title: "RAM" });
  }

  async function assertAdmin() {
    if (!client.getToken()) {
      window.location.href = "connexion.html";
      return false;
    }

    try {
      const profile = await client.request("/api/me");
      if (profile.role !== "admin") {
        window.location.href = "index.html";
        return false;
      }
      if (adminMeta) {
        adminMeta.textContent = `Connecte en admin: ${profile.email}`;
      }
      return true;
    } catch (error) {
      window.location.href = "connexion.html";
      return false;
    }
  }

  async function refreshLive() {
    const limit = Math.max(1, Math.min(200, Number(document.getElementById("admin-limit")?.value || "60")));

    try {
      const info = await client.request("/api/admin/infos");
      if (apiStatus) {
        apiStatus.textContent = info ? "ok" : "ko";
      }

      const payload = await client.request(`/api/metrics/live?limit=${limit}&include_system=true`);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      renderLive(items);

      if (count) {
        count.textContent = String(items.length);
      }

      const last = items.length ? items[items.length - 1] : null;
      if (lastTrainer) {
        lastTrainer.textContent = last?.trainer_name || "-";
      }
      if (lastUpdate) {
        lastUpdate.textContent = new Date().toLocaleTimeString();
      }
    } catch (error) {
      if (error.message === "UNAUTHORIZED") {
        logout();
        return;
      }
      if (apiStatus) {
        apiStatus.textContent = `erreur: ${error.message}`;
      }
      renderLive([]);
    }
  }

  const DATASET_LABELS = {
    "cifar100": "CIFAR-100",
    "fashion-mnist": "Fashion-MNIST",
    "none": "Arrete",
  };

  function renderDatasetState(dataset) {
    const label = document.getElementById("active-dataset-label");
    if (label) {
      label.textContent = DATASET_LABELS[dataset] || dataset;
      label.style.color = dataset === "none" ? "#ffd43b" : "#20c997";
    }
    ["cifar100", "fashion-mnist", "none"].forEach((d) => {
      const btn = document.getElementById(`dataset-btn-${d}`);
      if (btn) {
        btn.style.outline = d === dataset ? "2px solid #c089ff" : "";
        btn.style.opacity = d === dataset ? "1" : "0.6";
      }
    });
  }

  async function loadDatasetState() {
    try {
      const data = await client.request("/api/admin/trainers/states");
      renderDatasetState(data.dataset || "none");
    } catch (error) {
      if (error.message === "UNAUTHORIZED") {
        logout();
      }
    }
  }

  async function selectDataset(dataset) {
    try {
      await client.request("/api/admin/training/dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset }),
      });
      renderDatasetState(dataset);
    } catch (error) {
      if (error.message === "UNAUTHORIZED") {
        logout();
      }
    }
  }

  document.getElementById("admin-logout-btn")?.addEventListener("click", logout);
  document.getElementById("admin-refresh-btn")?.addEventListener("click", refreshLive);

  ["cifar100", "fashion-mnist", "none"].forEach((dataset) => {
    document.getElementById(`dataset-btn-${dataset}`)?.addEventListener("click", () => {
      selectDataset(dataset);
    });
  });

  const ok = await assertAdmin();
  if (!ok) {
    return;
  }

  await loadDatasetState();
  await refreshLive();
  setInterval(refreshLive, REFRESH_MS);
  setInterval(loadDatasetState, REFRESH_MS);
});
