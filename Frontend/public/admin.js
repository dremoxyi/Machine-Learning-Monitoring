document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "connexion.html";
    return;
  }

  try {
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      window.location.href = "connexion.html";
      return;
    }

    const me = await res.json();

    if (me.role !== "admin") {
      window.location.href = "index.html";
      return;
    }

    // Ici tu affiches les infos user/admin
    console.log("Utilisateur connecte:", me);
  } catch {
    window.location.href = "connexion.html";
  }
});