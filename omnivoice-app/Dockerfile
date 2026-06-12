FROM python:3.11-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    gcc g++ libsndfile1 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache model downloads to mounted volume
ENV HF_HOME=/app/model-cache
ENV TRANSFORMERS_CACHE=/app/model-cache

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY app.py .
COPY index.html .

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
