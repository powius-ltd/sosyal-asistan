#!/usr/bin/env python3
"""Yerel konuşma metni (faster-whisper). Video analizi `claude_frames` arka ucu çağırır.

Kullanım: python tools/transcribe.py <ses-veya-video-yolu>
Çıktı (stdout, tek JSON): { "language": "en", "text": "...", "segments": [{ "start": 0.0, "end": 2.4, "text": "..." }] }
Ortam: WHISPER_MODEL (varsayılan small), WHISPER_LANGUAGE (boş = otomatik), WHISPER_THREADS (varsayılan 2).
Çıkış kodu: 0 tamam · 3 faster-whisper kurulu değil · 4 dosya yok · 5 diğer hata. İlerleme/uyarı yalnız stderr'e yazılır.
CPU + int8; ses akışı olmayan video sessiz sayılır (boş metin), hata değildir.
"""
import json
import os
import sys


# Eşikler (basit tutuldu, env ile ezilmez). Whisper boşlukta / müzikte söz uydurur.
NO_SPEECH_PROB_MAX = 0.6  # bu değerin üstü VE ...
AVG_LOGPROB_MIN = -1.0  # ... bunun altı → segment atılır
COMPRESSION_RATIO_MAX = 2.4  # üstü (tekrar döngüsü) → atılır
# Bilinen sanrılar: TEK BAŞINA tüm transkripti oluşturuyorsa atılır. Kopyası:
# src/lib/video-analysis/transcribe.ts WHISPER_HALLUCINATIONS (iki liste birlikte güncellenir).
HALLUCINATIONS = ("you", "thank you", "thanks", "thanks for watching", "thank you for watching", "bye", "okay")


def normalize(text: str) -> str:
    return " ".join("".join(c.lower() if c.isalnum() else " " for c in text).split())


def is_noise(segment) -> bool:
    if segment.compression_ratio > COMPRESSION_RATIO_MAX:
        return True
    return segment.no_speech_prob > NO_SPEECH_PROB_MAX and segment.avg_logprob < AVG_LOGPROB_MIN


def fail(code: int, message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.exit(code)


def main() -> None:
    if len(sys.argv) != 2:
        fail(5, "kullanım: transcribe.py <dosya>")
    path = sys.argv[1]
    if not os.path.isfile(path):
        fail(4, "dosya bulunamadı")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        fail(3, "faster-whisper kurulu değil (pip install faster-whisper)")

    model_name = os.environ.get("WHISPER_MODEL", "").strip() or "small"
    language = os.environ.get("WHISPER_LANGUAGE", "").strip() or None
    threads = int(os.environ.get("WHISPER_THREADS", "").strip() or "2")
    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
        # vad_filter: müzik / sessizlikte uydurma metni azaltır.
        segments, info = model.transcribe(path, language=language, vad_filter=True, beam_size=3, condition_on_previous_text=False)
        items = []
        for segment in segments:
            text = segment.text.strip()
            if text and not is_noise(segment):
                items.append({"start": round(segment.start, 2), "end": round(segment.end, 2), "text": text})
        if items and all(normalize(i["text"]) in HALLUCINATIONS for i in items):
            items = []
    except Exception as error:  # noqa: BLE001 - tek çıkış kodu, ileti stderr'e
        message = str(error)
        if "does not contain any stream" in message or "no audio" in message.lower():
            print(json.dumps({"language": "und", "text": "", "segments": []}))
            return
        fail(5, f"{type(error).__name__}: {message}")

    print(json.dumps({"language": info.language or "und", "text": " ".join(i["text"] for i in items), "segments": items}, ensure_ascii=False))


if __name__ == "__main__":
    main()
