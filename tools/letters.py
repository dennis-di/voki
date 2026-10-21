"""Erzeugt die Buchstaben-Aufnahmen (FR/EN/DE) mit freien Piper-Stimmen als MP3 nach public/audio/<lang>/<hex>.mp3"""
import json, os, subprocess, sys, wave
from piper import PiperVoice
from piper.config import SynthesisConfig
V = sys.argv[1]  # Ordner mit den Stimmen
OUT = sys.argv[2]
ABC = 'abcdefghijklmnopqrstuvwxyz'
FR = dict(zip(ABC, ['a','bé','cé','dé','e','effe','gé','ache','i','ji','ka','elle','aime','enne','o','pé','ku','erre','esse','té','u','vé','double vé','ixe','i grec','zède']))
EN = dict(zip(ABC, ['ay','bee','see','dee','ee','eff','gee','aitch','eye','jay','kay','el','em','en','oh','pee','cue','ar','ess','tee','you','vee','double you','ex','why','zed']))
DE = dict(zip(ABC, ['Ah','Beh','Zeh','Deh','Eh','Eff','Geh','Hah','Ih','Jott','Kah','Ell','Emm','Enn','Oh','Peh','Kuh','Err','Ess','Teh','Uh','Fau','Weh','Ix','Üpsilon','Zett']))
# Akzente: Basisbuchstabe + Name des Zeichens (phonetisch geschrieben, damit die Stimme keine fehlenden Nasale braucht)
ACC = {'é':('e','acute'),'è':('e','grave'),'ê':('e','circ'),'ë':('e','trema'),'à':('a','grave'),'â':('a','circ'),'î':('i','circ'),'ï':('i','trema'),'ô':('o','circ'),'ù':('u','grave'),'û':('u','circ'),'ü':('u','trema'),'ç':('c','cedil'),'ÿ':('y','trema'),'ä':('a','umlaut'),'ö':('o','umlaut'),'ñ':('n','tilde')}
ACCN = {
 'fr': {'acute':'aksann aigu','grave':'aksann grave','circ':'aksann sirkonnflexe','trema':'tréma','cedil':'cédille','umlaut':'tréma','tilde':'tilde'},
 'en': {'acute':'acute','grave':'grave','circ':'circumflex','trema':'umlaut','cedil':'cedilla','umlaut':'umlaut','tilde':'tilde'},
 'de': {'acute':'mit Aksang egü','grave':'mit Aksang grahf','circ':'mit Aksang sirkongfläx','trema':'mit Trema','cedil':'mit Sedihje','umlaut':'Umlaut','tilde':'mit Tilde'},
}
UP = {'fr': lambda n: n + ' majuscule', 'en': lambda n: 'capital ' + n, 'de': lambda n: 'großes ' + n}
SPECIAL = {
 'fr': {"'":'apostrophe','-':'tiret','œ':'o e collés'},
 'en': {"'":'apostrophe','-':'hyphen'},
 'de': {"'":'Apostroph','-':'Bindestrich','œ':'Oh und Eh zusammen','ß':'Eszett'},
}
MODELS = {'fr':'fr-gilles-low/fr-gilles-low.onnx','en':'en-us-ryan-medium/en-us-ryan-medium.onnx','de':'de-thorsten-low/de-thorsten-low.onnx'}
NAMES = {'fr':FR,'en':EN,'de':DE}
manifest = {}
for lang, model in MODELS.items():
    v = PiperVoice.load(os.path.join(V, model))
    L = NAMES[lang]
    texts = {}
    for ch, n in L.items():
        texts[ch] = n; texts[ch.upper()] = UP[lang](n)
    for ch, (base, a) in ACC.items():
        if lang == 'en' and ch not in 'éèçñü': continue
        if lang == 'fr' and ch in 'äöñ': continue
        nm = (L[base] + ' ' + ACCN[lang][a]) if not (lang == 'de' and a == 'umlaut') else {'ä':'Ä','ö':'Ö','ü':'Ü'}[ch]
        texts[ch] = nm; texts[ch.upper()] = UP[lang](nm)
    for ch, n in SPECIAL[lang].items(): texts[ch] = n
    os.makedirs(os.path.join(OUT, lang), exist_ok=True)
    keys = []
    for ch, t in texts.items():
        ph = ''.join(sum(v.phonemize(t), []))
        if '̃' in ph: print('WARN nasal', lang, ch, t, ph)
        key = '-'.join('%x' % ord(c) for c in ch)
        w = f'/tmp/_l.wav'; m = os.path.join(OUT, lang, key + '.mp3')
        with wave.open(w, 'wb') as wf:
            v.synthesize_wav(t, wf, syn_config=SynthesisConfig(length_scale=1.12))
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',w,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.04','-ac','1','-ar','22050','-b:a','48k',m], check=True)
        keys.append(ch)
    manifest[lang] = ''.join(keys)
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), ensure_ascii=False)
print({k: len(v) for k, v in manifest.items()})
