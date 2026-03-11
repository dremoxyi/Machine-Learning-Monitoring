from fastapi import FastAPI

app = FastAPI(title="ML Monitoring API")


@app.get("/api/health")
def health():
    return {"status": "ok"}
