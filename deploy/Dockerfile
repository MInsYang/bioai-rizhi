FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.lock /app/backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock
COPY backend /app/backend
COPY scripts/manage.py /app/scripts/manage.py
COPY docs/bootstrap /app/docs/bootstrap
COPY dist /app/dist
RUN useradd --create-home bioai
USER bioai
EXPOSE 8000
CMD ["uvicorn","backend.app:app","--host","0.0.0.0","--port","8000"]
