#!/usr/bin/env python3
import os
import subprocess
import sys
import tempfile
from faster_whisper import WhisperModel


def stamp(sec: float) -> str:
    s = max(0, int(sec))
    return f"{s // 60:02d}:{s % 60:02d}"


PROMPT = "Студия Видиал Медиа. Сегодня у нас в гостях. Анимация, мультфильмы."


def transcribe_file(model, path, lang):
    segs = []
    kwargs = dict(
        language=lang or None,
        initial_prompt=PROMPT,
        condition_on_previous_text=False,
        beam_size=1,
        vad_filter=True,
    )
    try:
        segments, _info = model.transcribe(path, **kwargs)
    except Exception:
        kwargs.pop("vad_filter", None)
        segments, _info = model.transcribe(path, **kwargs)
    for s in segments:
        text = (s.text or "").strip()
        if text:
            segs.append((float(s.start), text))
    return segs


def audio_channels(path: str) -> int:
    try:
        import av

        c = av.open(path)
        st = next((s for s in c.streams if s.type == "audio"), None)
        n = int(st.channels) if st and st.channels else 1
        c.close()
        return n
    except Exception:
        return 1


def split_stereo(path: str, left: str, right: str) -> bool:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        path,
        "-filter_complex",
        "channelsplit=channel_layout=stereo[L][R]",
        "-map",
        "[L]",
        "-ac",
        "1",
        "-ar",
        "16000",
        left,
        "-map",
        "[R]",
        "-ac",
        "1",
        "-ar",
        "16000",
        right,
    ]
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return r.returncode == 0 and os.path.getsize(left) > 1000 and os.path.getsize(right) > 1000


args = sys.argv[1:]
if args and args[0] == "--tracks":
    lang = args[1] if len(args) > 1 else "ru"
    size = args[2] if len(args) > 2 else "small"
    pairs = list(zip(args[3::2], args[4::2]))
    model = WhisperModel(size, device="cpu", compute_type="int8")
    merged = []
    for pth, who in pairs:
        if not pth or not os.path.isfile(pth):
            continue
        for t, tx in transcribe_file(model, pth, lang):
            merged.append((t, who, tx))
    merged.sort(key=lambda x: x[0])
    lines = []
    last = ""
    buf = []
    t0 = 0.0
    for t, who, tx in merged:
        if who != last and buf:
            lines.append(f"[{stamp(t0)}] {last}: {' '.join(buf)}")
            buf = []
        if who != last:
            t0 = t
            last = who
        buf.append(tx)
    if last and buf:
        lines.append(f"[{stamp(t0)}] {last}: {' '.join(buf)}")
    sys.stdout.write("\n".join(lines).strip() + "\n")
    raise SystemExit(0)

path = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 else "ru"
size = sys.argv[3] if len(sys.argv) > 3 else "small"
left_name = sys.argv[4] if len(sys.argv) > 4 else "Организатор"
right_name = sys.argv[5] if len(sys.argv) > 5 else "Участники"
stereo = len(sys.argv) > 6 and sys.argv[6] in ("1", "true", "stereo")

model = WhisperModel(size, device="cpu", compute_type="int8")
lines = []

if stereo and audio_channels(path) >= 2:
    tmp = tempfile.mkdtemp(prefix="vd-stt-")
    left = os.path.join(tmp, "L.wav")
    right = os.path.join(tmp, "R.wav")
    if split_stereo(path, left, right):
        merged = [(t, left_name, tx) for t, tx in transcribe_file(model, left, lang)]
        merged += [(t, right_name, tx) for t, tx in transcribe_file(model, right, lang)]
        merged.sort(key=lambda x: x[0])
        last = ""
        buf = []
        t0 = 0.0
        for t, who, tx in merged:
            if who != last and buf:
                lines.append(f"[{stamp(t0)}] {last}: {' '.join(buf)}")
                buf = []
            if who != last:
                t0 = t
                last = who
            buf.append(tx)
        if last and buf:
            lines.append(f"[{stamp(t0)}] {last}: {' '.join(buf)}")
    try:
        os.remove(left)
        os.remove(right)
        os.rmdir(tmp)
    except OSError:
        pass

if not lines:
    for t, tx in transcribe_file(model, path, lang):
        lines.append(f"[{stamp(t)}] {tx}")

sys.stdout.write("\n".join(lines).strip() + "\n")
