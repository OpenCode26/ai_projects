# 1. Create volume
podman volume create omnivoice-models

# 2. Build
podman build -t omnivoice-demo:latest .

# 3. Run
podman run -d \
  --name omnivoice \
  -p 8001:8001 \
  -v omnivoice-models:/app/model-cache \
  omnivoice-demo:latest

# 4. Watch logs
podman logs -f omnivoice