FROM python:3.11-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set HuggingFace model cache to a mountable volume
ENV HF_HOME=/app/model-cache
ENV TRANSFORMERS_CACHE=/app/model-cache

# Avoid Python buffering (so logs show in real time)
ENV PYTHONUNBUFFERED=1

# Install OmniVoice and dependencies

# Fixed — both pinned to CPU index in the same command
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir omnivoice   # torch/torchaudio already locked to CPU


EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
    CMD curl -f http://localhost:8001 || exit 1

# Use OmniVoice built-in demo UI directly
CMD ["omnivoice-demo", "--ip", "0.0.0.0", "--port", "8001"]
