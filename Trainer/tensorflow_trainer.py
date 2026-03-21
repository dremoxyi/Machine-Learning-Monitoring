import os
import random
import time
import json

import psutil
from kafka import KafkaProducer

trainer_name = os.environ.get("TRAINER_NAME", "tensorflow")
bootstrap_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
topic = os.environ.get("KAFKA_METRICS_TOPIC", "metrics.raw")


def build_metrics_payload() -> dict:
    # TODO: Vraies valeurs
    return {
        "trainer_name": trainer_name,
        "latency_ms": round(random.uniform(80, 350), 2),
        "throughput": round(random.uniform(6, 28), 2),
        "cpu_percent": round(psutil.cpu_percent(interval=0.2), 2),
        "ram_percent": round(psutil.virtual_memory().percent, 2),
        "timestamp": int(time.time()),
    }


print(f"[{trainer_name}] Demarrage producer kafka vers {bootstrap_servers}, topic={topic}")

producer = None
while producer is None:
    try:
        producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda value: json.dumps(value).encode("utf-8"),
            retries=5,
            acks="all",
        )
    except Exception as exc:
        print(f"[{trainer_name}] Kafka indisponible ({exc}), retry dans 3s")
        time.sleep(3)

while True:
    payload = build_metrics_payload()
    try:
        producer.send(topic, payload)
        producer.flush(timeout=5)
        print(f"[{trainer_name}] metric envoyee: {payload}")
    except Exception as exc:
        print(f"[{trainer_name}] echec envoi metric: {exc}")
    time.sleep(5)
