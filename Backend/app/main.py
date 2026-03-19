import os
from typing import Optional

import bcrypt
import jwt
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr

app = FastAPI(title="ML Monitoring API")


def get_db_connection() -> psycopg.Connection:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg.connect(database_url)


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev_secret_change_me")


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def decode_bearer_token(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant")

    token = authorization[7:]
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide ou expire") from None

    return payload


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    return decode_bearer_token(authorization)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(payload: RegisterRequest) -> dict:
    password_hash = hash_password(payload.password)
    role = "client"

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, role)
                    VALUES (%s, %s, %s)
                    RETURNING id, email, role
                    """,
                    (payload.email, password_hash, role),
                )
                user = cur.fetchone()
            conn.commit()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="email deja utilise") from None
    except Exception:
        raise HTTPException(status_code=500, detail="erreur serveur") from None

    return {"id": user[0], "email": user[1], "role": user[2]}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, email, password_hash, role
                    FROM users
                    WHERE email = %s
                    """,
                    (payload.email,),
                )
                row = cur.fetchone()
    except Exception:
        raise HTTPException(status_code=500, detail="erreur serveur") from None

    if row is None:
        raise HTTPException(status_code=401, detail="identifiants invalides")

    user_id, email, password_hash, role = row
    if not verify_password(payload.password, password_hash):
        raise HTTPException(status_code=401, detail="identifiants invalides")

    token = jwt.encode(
        {"userId": user_id, "email": email, "role": role},
        get_jwt_secret(),
        algorithm="HS256",
    )

    return {
        "token": token,
        "role": role,
        "user": {"id": user_id, "email": email, "role": role},
    }


@app.get("/api/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, email, role, created_at
                    FROM users
                    WHERE id = %s
                    """,
                    (user.get("userId"),),
                )
                row = cur.fetchone()
    except Exception:
        raise HTTPException(status_code=500, detail="erreur serveur") from None

    if row is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    return {
        "id": row[0],
        "email": row[1],
        "role": row[2],
        "created_at": row[3].isoformat() if row[3] else None,
    }


@app.get("/api/admin/infos")
def admin_infos(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces refuse")
    return {"secret": "donnees admin"}
