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

  function drawLineChart(canvasId, values, color, maxY) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const width = canvas.clientWidth || 760;
    const height = Number(canvas.getAttribute("height") || "170");
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#2e2e2e";
    for (let i = 1; i <= 4; i += 1) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const clean = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
    if (!clean.length) {
      ctx.fillStyle = "#c8c8c8";
      ctx.font = "14px Arial";
      ctx.fillText("Aucune donnee", 12, 24);
      return;
    }

    const yMax = maxY || Math.max(...clean, 1);
    const xStep = clean.length > 1 ? width / (clean.length - 1) : width;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    clean.forEach((value, index) => {
      const x = xStep * index;
      const y = height - (value / yMax) * (height - 18) - 8;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
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

    drawLineChart("admin-accuracy-chart", items.map((item) => item.accuracy), "#3ea6ff", 1);
    drawLineChart("admin-speed-chart", items.map((item) => item.latency_ms), "#20c997");
    drawLineChart("admin-cpu-chart", items.map((item) => item.cpu_percent), "#ff8c42", 100);
    drawLineChart("admin-ram-chart", items.map((item) => item.ram_percent), "#ffd43b", 100);
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

  document.getElementById("admin-logout-btn")?.addEventListener("click", logout);
  document.getElementById("admin-refresh-btn")?.addEventListener("click", refreshLive);

  const ok = await assertAdmin();
  if (!ok) {
    return;
  }

  await refreshLive();
  setInterval(refreshLive, REFRESH_MS);
});
