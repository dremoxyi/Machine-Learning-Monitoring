import os
import time

print(f"[{os.environ.get('TRAINER_NAME', 'pytorch')}] En attente d'un message kafka...")

while True:
    time.sleep(5)
