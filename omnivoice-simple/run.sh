# OmniVoice Demo UI — Podman setup
# Run these commands from inside the omnivoice-simple folder

# ── 1. Create persistent volume (saves model across restarts) ──
podman volume create omnivoice-models

# ── 2. Build the image ──
podman build -t omnivoice-demo:latest .

# ── 3. Run the container ──
podman run -d \
  --name omnivoice \
  -p 8001:8001 \
  -v omnivoice-models:/app/model-cache \
  --memory=10g \
  --memory-swap=14g \
  omnivoice-demo:latest

# ── 4. Watch startup logs ──
#   Model downloads ~5GB on first run — wait for the UI to be ready
podman logs -f omnivoice

# ── 5. Open in browser ──
#   http://localhost:8001

# ─────────────────────────────────────────
# Useful commands
# ─────────────────────────────────────────

# Graceful stop (avoids semaphore warning)
podman stop --time 30 omnivoice

# Start again — model already cached, fast startup
podman start omnivoice

# Restart
podman restart omnivoice

# Check memory & CPU usage live
podman stats omnivoice

# Remove container only (volume/model cache kept)
podman rm omnivoice

# Remove everything including model cache
podman rm omnivoice
podman volume rm omnivoice-models
