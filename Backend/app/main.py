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
from kafka import KafkaConsumer, KafkaProducer
from pydantic import BaseModel, EmailStr

app = FastAPI(title="ML Monitoring API")

_active_dataset: str = "cifar100"
_kafka_control_producer: Optional[KafkaProducer] = None


def get_users_db_connection() -> psycopg.Connection:
    return psycopg.connect(os.getenv("USERS_DATABASE_URL"))


def get_metrics_db_connection() -> psycopg.Connection:
    return psycopg.connect(os.getenv("METRICS_DATABASE_URL"))


def get_logs_db_connection() -> psycopg.Connection:
    return psycopg.connect(os.getenv("LOGS_DATABASE_URL"))


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "quoicoubeh")


def build_full_name(firstname: Optional[str], lastname: Optional[str]) -> str:
    first = (firstname or "").strip()
    last = (lastname or "").strip()
    return f"{first} {last}".strip()


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

class TrainingDatasetRequest(BaseModel):
    dataset: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    firstname: str
    lastname: str


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


def ensure_users_schema() -> None:
    with get_users_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS firstname VARCHAR(100)")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS lastname VARCHAR(100)")
            cur.execute(
                """
                UPDATE users
                SET firstname = 'Blobi', lastname = 'Le Blob'
                WHERE email = 'admin@cy-tech.fr'
                """
            )
            cur.execute(
                """
                UPDATE users
                SET firstname = 'Bob', lastname = 'Léponge'
                WHERE email = 'user@cy-tech.fr'
                """
            )
            cur.execute(
                """
                UPDATE users
                SET
                    firstname = COALESCE(NULLIF(firstname, ''), split_part(email, '@', 1)),
                    lastname = COALESCE(lastname, '')
                """
            )
        conn.commit()


def persist_metric(metric: dict) -> None:
    with get_metrics_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO benchmark_metrics (
                    trainer_name,
                    run_id,
                    dataset_name,
                    step,
                    latency_ms,
                    throughput,
                    accuracy,
                    loss,
                    cpu_percent,
                    ram_percent,
                    payload
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    str(metric.get("trainer_name", "unknown")),
                    str(metric.get("run_id", "unknown")),
                    str(metric.get("dataset_name", "unknown")),
                    int(metric["step"]) if metric.get("step") is not None else None,
                    to_float(metric.get("latency_ms")),
                    to_float(metric.get("throughput")),
                    to_float(metric.get("accuracy")),
                    to_float(metric.get("loss")),
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


def kafka_control_producer_init_loop() -> None:
    global _kafka_control_producer
    bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    while True:
        try:
            _kafka_control_producer = KafkaProducer(
                bootstrap_servers=bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            print(f"[api] Kafka control producer connecte sur {bootstrap_servers}")
            return
        except Exception as exc:
            print(f"[api] Kafka control producer indisponible ({exc}), retry dans 3s")
            time.sleep(3)


@app.on_event("startup")
def on_startup() -> None:
    ensure_users_schema()
    threading.Thread(target=kafka_metrics_consumer_loop, daemon=True).start()
    threading.Thread(target=kafka_control_producer_init_loop, daemon=True).start()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(payload: RegisterRequest) -> dict:
    firstname = payload.firstname.strip()
    lastname = payload.lastname.strip()
    if not firstname or not lastname:
        raise HTTPException(status_code=400, detail="nom et prenom requis")

    try:
        with get_users_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, role, firstname, lastname)
                    VALUES (%s, %s, 'client', %s, %s)
                    RETURNING id, email, role, firstname, lastname
                    """,
                    (payload.email, hash_password(payload.password), firstname, lastname),
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

    return {
        "id": user[0],
        "email": user[1],
        "role": user[2],
        "firstname": user[3],
        "lastname": user[4],
        "full_name": build_full_name(user[3], user[4]),
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict:
    try:
        with get_users_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, email, password_hash, role, firstname, lastname
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

    user_id, email, password_hash, role, firstname, lastname = row
    if not verify_password(payload.password, password_hash):
        log_event("warn", "auth.login.failed", "identifiants invalides", payload.email)
        raise HTTPException(status_code=401, detail="identifiants invalides")

    token = jwt.encode(
        {
            "userId": user_id,
            "email": email,
            "role": role,
            "firstname": firstname,
            "lastname": lastname,
        },
        get_jwt_secret(),
        algorithm="HS256",
    )

    log_event("info", "auth.login.success", "connexion reussie", email)

    return {
        "token": token,
        "role": role,
        "user": {
            "id": user_id,
            "email": email,
            "role": role,
            "firstname": firstname,
            "lastname": lastname,
            "full_name": build_full_name(firstname, lastname),
        },
    }


@app.get("/api/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    user_id = user.get("userId")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide")

    try:
        with get_users_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, email, role, firstname, lastname
                    FROM users
                    WHERE id = %s
                    """,
                    (user_id,),
                )
                row = cur.fetchone()
    except Exception:
        raise HTTPException(status_code=500, detail="erreur serveur") from None

    if row is None:
        raise HTTPException(status_code=404, detail="utilisateur introuvable")

    return {
        "id": row[0],
        "email": row[1],
        "role": row[2],
        "firstname": row[3],
        "lastname": row[4],
        "full_name": build_full_name(row[3], row[4]),
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
                SELECT id, trainer_name, run_id, dataset_name, step,
                       latency_ms, throughput, accuracy, loss,
                       cpu_percent, ram_percent, created_at
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
            "run_id": row[2],
            "dataset_name": row[3],
            "step": row[4],
            "latency_ms": row[5],
            "throughput": row[6],
            "accuracy": row[7],
            "loss": row[8],
            "created_at": row[11].isoformat() if row[11] else None,
        }
        if include_system:
            metric["cpu_percent"] = row[9]
            metric["ram_percent"] = row[10]
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
        SELECT id, trainer_name, run_id, dataset_name, step,
               latency_ms, throughput, accuracy, loss,
               cpu_percent, ram_percent, created_at
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
            "run_id": row[2],
            "dataset_name": row[3],
            "step": row[4],
            "latency_ms": row[5],
            "throughput": row[6],
            "accuracy": row[7],
            "loss": row[8],
            "created_at": row[11].isoformat() if row[11] else None,
        }
        if include_system:
            metric["cpu_percent"] = row[9]
            metric["ram_percent"] = row[10]
        items.append(metric)

    return {"items": items}

VALID_DATASETS = ("cifar100", "fashion-mnist", "none")


@app.get("/api/admin/trainers/states")
def get_trainer_states(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces refuse")
    return {"dataset": _active_dataset}


@app.post("/api/admin/training/dataset")
def set_training_dataset(
    payload: TrainingDatasetRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    global _active_dataset
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acces refuse")
    if payload.dataset not in VALID_DATASETS:
        raise HTTPException(status_code=400, detail=f"dataset doit etre parmi: {', '.join(VALID_DATASETS)}")
    _active_dataset = payload.dataset
    if _kafka_control_producer is not None:
        for tname in ("pytorch", "tensorflow"):
            _kafka_control_producer.send(f"trainer.control.{tname}", value={"dataset": payload.dataset})
        _kafka_control_producer.flush(timeout=5)
    log_event("info", "training.dataset.change", f"dataset: {payload.dataset}", user.get("email"))
    return {"dataset": payload.dataset}
