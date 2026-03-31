import os
import time
import json
import pickle
import struct
import uuid
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import tensorflow as tf

import psutil
from kafka import KafkaProducer

trainer_name = os.environ.get("TRAINER_NAME", "tensorflow")
run_id = str(uuid.uuid4())
bootstrap_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
topic = os.environ.get("KAFKA_METRICS_TOPIC", f"metrics.trainer.{trainer_name}")
dataset_names = [
    value.strip()
    for value in os.environ.get("DATASET_NAMES", "cifar100,fashion-mnist").split(",")
    if value.strip()
]
if not dataset_names:
    dataset_names = ["unknown"]
batch_size = int(os.environ.get("BATCH_SIZE", "64"))
learning_rate = float(os.environ.get("LEARNING_RATE", "0.001"))
train_loop_sleep_seconds = float(os.environ.get("TRAIN_LOOP_SLEEP_SECONDS", "0.5"))
train_seed = int(os.environ.get("TRAIN_SEED", "42"))

tf.keras.utils.set_random_seed(train_seed)


def load_idx_images(file_path: Path) -> np.ndarray:
    raw = file_path.read_bytes()
    magic, item_count, rows, cols = struct.unpack_from(">IIII", raw, 0)
    if magic != 2051:
        raise ValueError(f"invalid image idx file: {file_path}")
    data = np.frombuffer(raw, dtype=np.uint8, offset=16)
    return data.reshape(item_count, rows, cols)


def load_idx_labels(file_path: Path) -> np.ndarray:
    raw = file_path.read_bytes()
    magic, item_count = struct.unpack_from(">II", raw, 0)
    if magic != 2049:
        raise ValueError(f"invalid label idx file: {file_path}")
    return np.frombuffer(raw, dtype=np.uint8, offset=8).reshape(item_count)


def load_fashion_mnist(base_path: Path) -> Tuple[np.ndarray, np.ndarray]:
    images = load_idx_images(base_path / "train-images-idx3-ubyte")
    labels = load_idx_labels(base_path / "train-labels-idx1-ubyte")
    x = (images.astype(np.float32) / 255.0)[..., np.newaxis]
    y = labels.astype(np.int64)
    return x, y


def load_cifar100(base_path: Path) -> Tuple[np.ndarray, np.ndarray]:
    with (base_path / "train").open("rb") as handle:
        payload = pickle.load(handle, encoding="bytes")

    images = payload[b"data"]
    labels = payload[b"fine_labels"]

    x = images.reshape(-1, 3, 32, 32).transpose(0, 2, 3, 1).astype(np.float32) / 255.0
    y = np.array(labels, dtype=np.int64)
    return x, y


def build_model(input_shape: Tuple[int, ...], num_classes: int) -> tf.keras.Model:
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=input_shape),
            tf.keras.layers.Conv2D(32, kernel_size=3, activation="relu", padding="same"),
            tf.keras.layers.MaxPool2D(),
            tf.keras.layers.Conv2D(64, kernel_size=3, activation="relu", padding="same"),
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def load_dataset_state(dataset_name: str) -> Dict[str, object]:
    if dataset_name == "fashion-mnist":
        x_train, y_train = load_fashion_mnist(Path("/data/fashion-mnist/extracted"))
        num_classes = 10
    elif dataset_name == "cifar100":
        x_train, y_train = load_cifar100(Path("/data/cifar100/extracted/cifar-100-python"))
        num_classes = 100
    else:
        raise ValueError(f"unsupported dataset: {dataset_name}")

    model = build_model(tuple(x_train.shape[1:]), num_classes)

    return {
        "dataset_name": dataset_name,
        "x_train": x_train,
        "y_train": y_train,
        "cursor": 0,
        "step": 0,
        "model": model,
    }


def take_batch(state: Dict[str, object], batch_len: int) -> Tuple[np.ndarray, np.ndarray]:
    x_train = state["x_train"]
    y_train = state["y_train"]
    cursor = state["cursor"]
    data_len = int(x_train.shape[0])

    end = cursor + batch_len
    if end <= data_len:
        x_batch = x_train[cursor:end]
        y_batch = y_train[cursor:end]
    else:
        split = end - data_len
        x_batch = np.concatenate([x_train[cursor:], x_train[:split]], axis=0)
        y_batch = np.concatenate([y_train[cursor:], y_train[:split]], axis=0)

    state["cursor"] = end % data_len
    return x_batch, y_batch


def build_metrics_payload(dataset_name: str, latency_ms: float, throughput: float, loss: float, accuracy: float, step: int) -> dict:
    return {
        "trainer_name": trainer_name,
        "run_id": run_id,
        "dataset_name": dataset_name,
        "latency_ms": round(latency_ms, 2),
        "throughput": round(throughput, 2),
        "loss": round(loss, 6),
        "accuracy": round(accuracy, 6),
        "step": step,
        "cpu_percent": round(psutil.cpu_percent(interval=0.2), 2),
        "ram_percent": round(psutil.virtual_memory().percent, 2),
        "timestamp": int(time.time()),
    }


print(
    f"[{trainer_name}] Demarrage producer kafka vers {bootstrap_servers}, "
    f"topic={topic}, datasets={dataset_names}, batch_size={batch_size}, "
    f"learning_rate={learning_rate}, seed={train_seed}"
)

dataset_states: Dict[str, Dict[str, object]] = {}
for name in dataset_names:
    try:
        state = load_dataset_state(name)
        dataset_states[name] = state
        print(f"[{trainer_name}] Dataset charge: {name}, samples={state['x_train'].shape[0]}")
    except Exception as exc:
        print(f"[{trainer_name}] Dataset ignore ({name}): {exc}")

if not dataset_states:
    raise RuntimeError(f"[{trainer_name}] Aucun dataset exploitable trouve dans /data")

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

dataset_index = 0
active_dataset_names = list(dataset_states.keys())

while True:
    dataset_name = active_dataset_names[dataset_index % len(active_dataset_names)]
    dataset_index += 1
    state = dataset_states[dataset_name]
    x_batch, y_batch = take_batch(state, batch_size)
    start_time = time.perf_counter()
    batch_loss, batch_accuracy = state["model"].train_on_batch(x_batch, y_batch)
    elapsed_seconds = max(time.perf_counter() - start_time, 1e-9)
    state["step"] += 1

    payload = build_metrics_payload(
        dataset_name=dataset_name,
        latency_ms=elapsed_seconds * 1000.0,
        throughput=float(x_batch.shape[0]) / elapsed_seconds,
        loss=float(batch_loss),
        accuracy=float(batch_accuracy),
        step=int(state["step"]),
    )

    try:
        producer.send(topic, key=dataset_name.encode("utf-8"), value=payload)
        producer.flush(timeout=5)
        print(f"[{trainer_name}] metric envoyee: {payload}")
    except Exception as exc:
        print(f"[{trainer_name}] echec envoi metric: {exc}")
    time.sleep(train_loop_sleep_seconds)
