#!/usr/bin/env python3
"""Montaje final con ffmpeg.

Lee un `edit.json` con:
  {
    "source": "bruto.mp4",            # vídeo con la voz (puede ser lista: ["a.mov","b.mov"])
    "overlay": "overlay.mov",         # gráficos con alfa (salida de render.mjs), opcional
    "fps": 30, "width": 1920, "height": 1080,
    "cuts": [                         # orden de montaje; cada corte sale del bruto
      {"in": 3.2, "out": 9.8, "zoom": 1.0},        # plano general
      {"in": 9.8, "out": 14.1, "zoom": 1.18},      # punch-in (encuadre cerrado)
      {"in": 14.1, "out": 20.0, "zoom": 1.0, "src": 0}
    ],
    "sfx": [ {"at": 4.0, "kind": "pop"}, {"at": 9.8, "kind": "whoosh"} ],   # opcional, sintetizados
    "music": {"file": "musica.mp3", "gain_db": -22},                           # opcional
    "output": "final.mp4"
  }
Los tiempos de `cuts` son del bruto; el timeline de gráficos va en tiempo del MONTAJE
(usa `python3 compose.py edit.json --map` para convertir marcas del bruto a montaje).
"""
import json, subprocess, sys, os, math

def load(p):
    with open(p, encoding='utf-8') as f: return json.load(f)

def montage_time(cuts, src_t):
    """Convierte un instante del bruto al instante equivalente en el montaje."""
    acc = 0.0
    for c in cuts:
        if c['in'] <= src_t <= c['out']:
            return acc + (src_t - c['in'])
        acc += c['out'] - c['in']
    return None

def build(edit):
    W, H, fps = edit.get('width', 1920), edit.get('height', 1080), edit.get('fps', 30)
    sources = edit['source'] if isinstance(edit['source'], list) else [edit['source']]
    cuts = edit['cuts']
    inputs = []
    for s in sources: inputs += ['-i', s]
    fc = []
    # cada corte: recorte temporal + punch-in (crop centrado y escalado a WxH)
    for i, c in enumerate(cuts):
        src = c.get('src', 0)
        z = float(c.get('zoom', 1.0))
        ax, ay = c.get('anchor', [0.5, 0.42])          # punto de interés (cara ≈ un poco arriba del centro)
        cw, ch = f"iw/{z}", f"ih/{z}"
        cx, cy = f"(iw-{cw})*{ax}", f"(ih-{ch})*{ay}"
        v = (f"[{src}:v]trim=start={c['in']}:end={c['out']},setpts=PTS-STARTPTS,"
             f"crop={cw}:{ch}:{cx}:{cy},scale={W}:{H}:flags=lanczos,setsar=1,fps={fps},format=yuv420p[v{i}]")
        a = f"[{src}:a]atrim=start={c['in']}:end={c['out']},asetpts=PTS-STARTPTS[a{i}]"
        fc += [v, a]
    n = len(cuts)
    fc.append(''.join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vcat][acat]")
    vout, aout = '[vcat]', '[acat]'
    idx = len(sources)
    if edit.get('overlay'):
        inputs += ['-i', edit['overlay']]
        fc.append(f"{vout}[{idx}:v]overlay=0:0:format=auto:eof_action=pass:shortest=0[vov]")
        vout = '[vov]'; idx += 1
    # SFX sintetizados (sin ficheros externos): pop = seno corto con caída, whoosh = ruido filtrado
    sfx = edit.get('sfx', [])
    mix = [aout]
    for j, s in enumerate(sfx):
        at = s['at']
        if s.get('kind', 'pop') == 'pop':
            g = (f"sine=frequency=720:duration=0.12,afade=t=out:st=0.02:d=0.1,volume=0.35,"
                 f"adelay={int(at*1000)}|{int(at*1000)}[s{j}]")
        else:
            g = (f"anoisesrc=color=brown:duration=0.45:amplitude=0.6,lowpass=f=1800,afade=t=in:d=0.1,afade=t=out:st=0.2:d=0.25,"
                 f"volume=0.5,adelay={int(at*1000)}|{int(at*1000)}[s{j}]")
        fc.append(g); mix.append(f"[s{j}]")
    if edit.get('music'):
        m = edit['music']; inputs += ['-i', m['file']]
        fc.append(f"[{idx}:a]volume={m.get('gain_db',-22)}dB,aloop=loop=-1:size=2e9[mus]"); mix.append('[mus]'); idx += 1
    if len(mix) > 1:
        fc.append(''.join(mix) + f"amix=inputs={len(mix)}:duration=first:normalize=0[amix]")
        aout = '[amix]'
    # voz: compresor suave + loudness de YouTube (-14 LUFS aprox.)
    fc.append(f"{aout}acompressor=threshold=-18dB:ratio=3:attack=10:release=120,loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-stats', *inputs, '-filter_complex', ';'.join(fc),
           '-map', vout, '-map', '[aout]', '-c:v', 'libx264', '-preset', edit.get('preset', 'medium'), '-crf', str(edit.get('crf', 18)),
           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', edit['output']]
    return cmd

if __name__ == '__main__':
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    edit = load(sys.argv[1])
    if '--map' in sys.argv:
        for t in sys.argv[sys.argv.index('--map') + 1:]:
            print(t, '->', montage_time(edit['cuts'], float(t)))
        sys.exit(0)
    cmd = build(edit)
    if '--dry' in sys.argv: print(' '.join(map(lambda x: f'"{x}"' if ' ' in x or ';' in x else x, cmd))); sys.exit(0)
    sys.exit(subprocess.call(cmd))
