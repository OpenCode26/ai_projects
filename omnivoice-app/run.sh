# Run these commands one by one in Podman Desktop terminal
# or in your system terminal

# 1. Create persistent volume for model cache
podman volume create omnivoice-models

# 2. Build the image (run from inside omnivoice-app folder)
podman build -t omnivoice:latest .

# 3. Run the container with web UI
podman run -d \
  --name omnivoice \
  -p 8001:8001 \
  -v omnivoice-models:/app/model-cache \
  --memory=10g \
  --memory-swap=14g \
  omnivoice:latest

# 4. Watch logs (model download + startup)
podman logs -f omnivoice

# 5. Open in browser once you see "Model loaded!"
#    http://localhost:8001

# --- Useful commands ---

# Stop container
podman stop omnivoice

# Start again (model already cached, fast startup)
podman start omnivoice

# Remove container (keeps volume/model cache)
podman rm omnivoice

# Check memory usage
podman stats omnivoice
