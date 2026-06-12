from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import soundfile as sf
import torch
import os
import shutil

app = FastAPI()

model = None
MODEL_LOADED = False

def load_model():
    global model, MODEL_LOADED
    if model is None:
        print("Loading OmniVoice model...")
        from omnivoice import OmniVoice
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            dtype=torch.float16,
            device_map="cpu"
        )
        MODEL_LOADED = True
        print("Model loaded!")
    return model

@app.on_event("startup")
async def startup():
    load_model()

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": MODEL_LOADED}

@app.post("/generate")
async def generate(
    text: str = Form(...),
    ref_text: str = Form(""),
    ref_audio: UploadFile = File(None)
):
    try:
        m = load_model()
        ref_audio_path = None

        if ref_audio and ref_audio.filename:
            ref_audio_path = f"/tmp/ref_{ref_audio.filename}"
            with open(ref_audio_path, "wb") as f:
                shutil.copyfileobj(ref_audio.file, f)

        kwargs = {"text": text}
        if ref_audio_path:
            kwargs["ref_audio"] = ref_audio_path
        if ref_text:
            kwargs["ref_text"] = ref_text

        audio = m.generate(**kwargs)
        out_path = "/tmp/output.wav"
        sf.write(out_path, audio[0], 24000)

        if ref_audio_path and os.path.exists(ref_audio_path):
            os.remove(ref_audio_path)

        return FileResponse(out_path, media_type="audio/wav", filename="output.wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/", response_class=HTMLResponse)
async def ui():
    with open("/app/index.html", "r") as f:
        return f.read()
