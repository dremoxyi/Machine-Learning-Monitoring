require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "backend" });
});

app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const role = "client";

    if (!email || !password) {
      return res.status(400).json({ message: "email et mot de passe requis" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role",
      [email, passwordHash, role]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "email deja utilise" });
    }

    console.error("Register error:", err);
    return res.status(500).json({ message: "erreur serveur" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email et mot de passe requis" });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "identifiants invalides" });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: "identifiants invalides" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "quoicoubeh",
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      role: user.role,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "erreur serveur" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

const { requireAuth, requireRole } = require("./authvisiteur");

app.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, email, role, created_at FROM users WHERE id = $1",
    [req.user.userId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ message: "Utilisateur introuvable" });
  }

  res.json(result.rows[0]);
});

app.get("/admin/infos", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ secret: "donnees admin" });
});