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

  function drawLineChart(canvasId, values, color, maxY) {
    const canvas = byId(canvasId);
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const width = canvas.clientWidth || 760;
    const height = Number(canvas.getAttribute("height") || "180");
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#2e2e2e";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i += 1) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const points = values.filter((v) => v !== null);
    if (!points.length) {
      ctx.fillStyle = "#c8c8c8";
      ctx.font = "14px Arial";
      ctx.fillText("Aucune donnee", 14, 24);
      return;
    }

    const yMax = maxY || Math.max(...points, 1);
    const xStep = points.length <= 1 ? width : width / (points.length - 1);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    points.forEach((value, index) => {
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
    const accuracyValues = state.items.map((item) => safeNumber(item.accuracy));
    const latencyValues = state.items.map((item) => safeNumber(item.latency_ms));
    const throughputValues = state.items.map((item) => safeNumber(item.throughput));
    const cpuValues = state.items.map((item) => safeNumber(item.cpu_percent));
    const ramValues = state.items.map((item) => safeNumber(item.ram_percent));

    drawLineChart("precision-chart", accuracyValues, "#3ea6ff", 1);
    drawLineChart("speed-chart", latencyValues, "#20c997", undefined);

    if (state.profile && state.profile.role === "admin") {
      setText("cpu-access-msg", "Visible uniquement pour admin. Donnees hote live.");
      setText("ram-access-msg", "Visible uniquement pour admin. Donnees hote live.");
      drawLineChart("cpu-chart", cpuValues, "#ff8c42", 100);
      drawLineChart("ram-chart", ramValues, "#ffd43b", 100);
    } else {
      setText("cpu-access-msg", "Acces refuse: seul un admin peut visualiser CPU.");
      setText("ram-access-msg", "Acces refuse: seul un admin peut visualiser RAM.");
      drawLineChart("cpu-chart", [], "#ff8c42", 100);
      drawLineChart("ram-chart", [], "#ffd43b", 100);
    }

    setText("speed-latency", avg(latencyValues));
    setText("speed-throughput", avg(throughputValues));
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
