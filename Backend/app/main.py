import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException
from kafka import KafkaConsumer
from pydantic import BaseModel, EmailStr

app = FastAPI(title="ML Monitoring API")


def get_users_db_connection() -> psycopg.Connection:
    return psycopg.connect(os.getenv("USERS_DATABASE_URL"))


def get_metrics_db_connection() -> psycopg.Connection:
    return psycopg.connect(os.getenv("METRICS_DATABASE_URL"))


def get_logs_db_connection() -> psycopg.Connection:
    return psycopg.connect(os.getenv("LOGS_DATABASE_URL"))


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "quoicoubeh")


def to_float(value: object) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def decode_bearer_token(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant")

    try:
        return jwt.decode(authorization[7:], get_jwt_secret(), algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide ou expire") from None


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    return decode_bearer_token(authorization)


def log_event(level: str, event: str, message: str, user_email: Optional[str] = None) -> None:
    try:
        with get_logs_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO app_logs (level, event, message, user_email)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (level, event, message, user_email),
                )
            conn.commit()
    except Exception as exc:
        print(f"[api] log write failed: {exc}")


def persist_metric(metric: dict) -> None:
    with get_metrics_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO benchmark_metrics (
                    trainer_name,
                    latency_ms,
                    throughput,
                    cpu_percent,
                    ram_percent,
                    payload
                )
                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    str(metric.get("trainer_name", "unknown")),
                    to_float(metric.get("latency_ms")),
                    to_float(metric.get("throughput")),
                    to_float(metric.get("cpu_percent")),
                    to_float(metric.get("ram_percent")),
                    json.dumps(metric),
                ),
            )
        conn.commit()


def kafka_metrics_consumer_loop() -> None:
    topics_raw = os.getenv("KAFKA_METRICS_TOPICS", "metrics.trainer.pytorch,metrics.trainer.tensorflow")
    topics = [value.strip() for value in topics_raw.split(",") if value.strip()]
    if not topics:
        topics = ["metrics.trainer.pytorch", "metrics.trainer.tensorflow"]
    bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    consumer_group_id = os.getenv("KAFKA_CONSUMER_GROUP_ID", "ml-monitoring-api")

    while True:
        try:
            consumer = KafkaConsumer(
                *topics,
                bootstrap_servers=bootstrap_servers,
                auto_offset_reset="latest",
                enable_auto_commit=True,
                group_id=consumer_group_id,
                value_deserializer=lambda raw: json.loads(raw.decode("utf-8")),
            )
            print(f"[api] Kafka consumer connecte sur {bootstrap_servers}, topics={topics}")

            for message in consumer:
                if isinstance(message.value, dict):
                    persist_metric(message.value)
        except Exception as exc:
            print(f"[api] Kafka consumer erreur: {exc}")
            time.sleep(3)


@app.on_event("startup")
def on_startup() -> None:
    threading.Thread(target=kafka_metrics_consumer_loop, daemon=True).start()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(payload: RegisterRequest) -> dict:
    try:
        with get_users_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, role)
                    VALUES (%s, %s, 'client')
                    RETURNING id, email, role
                    """,
                    (payload.email, hash_password(payload.password)),
                )
                user = cur.fetchone()
            conn.commit()
    except psycopg.errors.UniqueViolation:
        log_event("warn", "auth.register.duplicate", "email deja utilise", payload.email)
        raise HTTPException(status_code=409, detail="email deja utilise") from None
    except Exception:
        log_event("error", "auth.register.error", "erreur serveur", payload.email)
        raise HTTPException(status_code=500, detail="erreur serveur") from None

    log_event("info", "auth.register.success", "inscription reussie", payload.email)

    return {"id": user[0], "email": user[1], "role": user[2]}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict:
    try:
        with get_users_db_connection() as conn:
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
        log_event("error", "auth.login.error", "erreur serveur", payload.email)
        raise HTTPException(status_code=500, detail="erreur serveur") from None

    if row is None:
        log_event("warn", "auth.login.failed", "identifiants invalides", payload.email)
        raise HTTPException(status_code=401, detail="identifiants invalides")

    user_id, email, password_hash, role = row
    if not verify_password(payload.password, password_hash):
        log_event("warn", "auth.login.failed", "identifiants invalides", payload.email)
        raise HTTPException(status_code=401, detail="identifiants invalides")

    token = jwt.encode(
        {"userId": user_id, "email": email, "role": role},
        get_jwt_secret(),
        algorithm="HS256",
    )

    log_event("info", "auth.login.success", "connexion reussie", email)

    return {
        "token": token,
        "role": role,
        "user": {"id": user_id, "email": email, "role": role},
    }


@app.get("/api/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    return {
        "id": user.get("userId"),
        "email": user.get("email"),
        "role": user.get("role"),
    }


@app.get("/api/admin/infos")
def admin_infos(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces refuse")
    return {"secret": "donnees admin"}


@app.get("/api/metrics/live")
def metrics_live(
    limit: int = 20,
    include_system: bool = False,
    user: dict = Depends(get_current_user),
) -> dict:
    if include_system and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces refuse")

    limit = min(max(limit, 1), 200)

    with get_metrics_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, trainer_name, latency_ms, throughput, cpu_percent, ram_percent, created_at
                FROM benchmark_metrics
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()

    items = []
    for row in reversed(rows):
        metric = {
            "id": row[0],
            "trainer_name": row[1],
            "latency_ms": row[2],
            "throughput": row[3],
            "created_at": row[6].isoformat() if row[6] else None,
        }
        if include_system:
            metric["cpu_percent"] = row[4]
            metric["ram_percent"] = row[5]
        items.append(metric)

    return {"items": items}


@app.get("/api/metrics/history")
def metrics_history(
    trainer_name: Optional[str] = None,
    since_minutes: int = 60,
    limit: int = 500,
    include_system: bool = False,
    user: dict = Depends(get_current_user),
) -> dict:
    if include_system and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces refuse")

    limit = min(max(limit, 1), 2000)
    since_minutes = min(max(since_minutes, 1), 7 * 24 * 60)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)

    query = """
        SELECT id, trainer_name, latency_ms, throughput, cpu_percent, ram_percent, created_at
        FROM benchmark_metrics
        WHERE created_at >= %s
    """
    params = [cutoff]

    if trainer_name:
        query += " AND trainer_name = %s"
        params.append(trainer_name)

    query += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)

    with get_metrics_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    items = []
    for row in reversed(rows):
        metric = {
            "id": row[0],
            "trainer_name": row[1],
            "latency_ms": row[2],
            "throughput": row[3],
            "created_at": row[6].isoformat() if row[6] else None,
        }
        if include_system:
            metric["cpu_percent"] = row[4]
            metric["ram_percent"] = row[5]
        items.append(metric)

    return {"items": items}
