# Machine-Learning-Monitoring
Projet Final de Architecture | Microservice 

## Lancement du projet
```bash
docker compose up -d --build
```

## Architecture BDD

- users-db (PostgreSQL): comptes utilisateurs, authentification, roles
- metrics-db (PostgreSQL): stockage des metriques de benchmark
- logs-db (PostgreSQL): logs des evenements et erreurs

## Users

- **Admin 1**:
    - Email: admin@cy-tech.fr
    - Password: admin
- **Admin 2**:
    - Email: alice@cy-tech.fr
    - Password: alice
- **User 1**:
    - Email: user@cy-tech.fr
    - Password: bob
- **User 2**:
    - Email: charlie@cy-tech.fr
    - Password: charlie
- **User 3**:
    - Email: dana@cy-tech.fr
    - Password: dana
    
## Datasets

Les datasets sont stockes dans un volume Docker partage, monte en lecture seule dans les trainers (`/data`).
Le telechargement est automatique via des services one-shot au demarrage.

- **CIFAR-100**: 100 classes d'images, 60000 images (50000 train, 10000 test)
- **Fashion-MNIST**: 10 classes d'images grayscale, 70000 images (60000 train, 10000 test)