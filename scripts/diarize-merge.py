#!/usr/bin/env python3
"""Whisper segments + optional pyannote diarization → dialogue lines."""
import json
import os
import subprocess
import sys
import tempfile


def stamp(sec: float) -> str:
    s = max(0, int(sec))
    return f"{s // 60:02d}:{s % 60:02d}"


def to_wav(src: str, dst: str) -> None:
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", "16000", dst],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def whisper_segs(wav: str, lang: str, size: str):
    from faster_whisper import WhisperModel

    model = WhisperModel(size, device="cpu", compute_type="int8")
    out = []
    prompt = "Студия Видиал Медиа. Сегодня у нас в гостях. Анимация, мультфильмы."
    kwargs = dict(
        language=lang or None,
        initial_prompt=prompt,
        condition_on_previous_text=False,
        beam_size=1,
        vad_filter=True,
    )
    try:
        it = model.transcribe(wav, **kwargs)[0]
    except Exception:
        kwargs.pop("vad_filter", None)
        it = model.transcribe(wav, **kwargs)[0]
    for s in it:
        text = (s.text or "").strip()
        if text:
            out.append({"start": float(s.start), "end": float(s.end), "text": text})
    return out


def wav_seconds(path: str) -> float:
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            text=True,
        )
        return float(out.strip() or 0)
    except Exception:
        return 0.0


def load_pipe(token: str):
    import torch
    from pyannote.audio import Pipeline

    try:
        pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=token)
    except TypeError:
        pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=token)
    pipe.to(torch.device("cpu"))
    return pipe


def diarize_file(pipe, wav: str, offset: float):
    diar = pipe(wav)
    turns = []
    for turn, _, spk in diar.itertracks(yield_label=True):
        turns.append(
            {
                "start": float(turn.start) + offset,
                "end": float(turn.end) + offset,
                "speaker": str(spk),
            }
        )
    return turns


SLICE = 600


def diarize(wav: str):
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or ""
    if not token:
        return []
    try:
        pipe = load_pipe(token)
    except ImportError:
        return []
    dur = wav_seconds(wav)
    if dur <= SLICE + 30:
        return diarize_file(pipe, wav, 0)
    turns = []
    t = 0.0
    n = 0
    while t < dur - 1:
        chunk = wav + f".p{n}.wav"
        subprocess.check_call(
            ["ffmpeg", "-y", "-ss", str(t), "-t", str(SLICE), "-i", wav, "-ac", "1", "-ar", "16000", chunk],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            if os.path.getsize(chunk) > 1000:
                part = diarize_file(pipe, chunk, t)
                for u in part:
                    u["speaker"] = f"{u['speaker']}_s{n}"
                turns.extend(part)
                sys.stderr.write(f"diarize_slice {n} t={int(t)}\n")
        finally:
            try:
                os.unlink(chunk)
            except OSError:
                pass
        t += SLICE
        n += 1
    return turns


def assign(seg, turns):
    if not turns:
        return ""
    best, score = "", -1.0
    a, b = seg["start"], max(seg["end"], seg["start"] + 0.2)
    for t in turns:
        ov = min(b, t["end"]) - max(a, t["start"])
        if ov > score:
            score = ov
            best = t["speaker"]
    if score <= 0:
        return ""
    num = "".join(ch for ch in best if ch.isdigit()) or best
    try:
        n = int(num) + 1
    except ValueError:
        n = abs(hash(best)) % 9 + 1
    return f"Спикер {n}"


def main():
    path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "ru"
    size = sys.argv[3] if len(sys.argv) > 3 else "small"
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        to_wav(path, tmp.name)
        segs = whisper_segs(tmp.name, lang, size)
        turns = []
        try:
            turns = diarize(tmp.name)
        except Exception as e:
            sys.stderr.write(f"diarize skip: {e}\n")
        lines = []
        last = ""
        buf = []
        t0 = 0.0
        for s in segs:
            who = assign(s, turns)
            if who != last and buf:
                prefix = f"{last}: " if last else ""
                lines.append(f"[{stamp(t0)}] {prefix}{' '.join(buf)}")
                buf = []
            if who != last:
                t0 = s["start"]
                last = who
            buf.append(s["text"])
        if buf:
            prefix = f"{last}: " if last else ""
            lines.append(f"[{stamp(t0)}] {prefix}{' '.join(buf)}")
        sys.stdout.write("\n".join(lines).strip() + "\n")
        if turns:
            sys.stderr.write(f"diarize_ok speakers={len({t['speaker'] for t in turns})}\n")
        else:
            sys.stderr.write("diarize_off\n")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


if __name__ == "__main__":
    main()
