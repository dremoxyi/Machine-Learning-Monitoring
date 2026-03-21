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

- **Admin**:
    - Email: admin@cy-tech.fr
    - Password: admin

- **User**:
    - Email: user@cy-tech.fr
    - Password: user