# Calculadora IRPF

Calcula el sou net a partir del brut tenint en compte les cotitzacions a la Seguretat Social, l'IRPF real anual (escala estatal i catalana 2026, mínim personal i familiar i deducció per rendiments del treball) i la situació familiar. Inclou una eina per calcular el brut anual necessari per cobrar un net mensual concret i una altra per veure quant et queda realment d'una pujada de sou.

La xifra principal és el que pagues de veritat (impost anual). Al costat i a la nòmina es mostra el net que hi veuràs, calculat amb l'algorisme públic de retencions de l'Agència Tributaria [EJERCICIO_2026](https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/ALGORITMO_2026.pdf), que fa servir una escala única per a tot l'Estat.

Fonts: escala catalana del Decret llei 5/2025 (art. 611-1 Codi tributari de Catalunya), deducció de la DA 61a LIRPF segons el RDL 5/2026, bases i tipus de cotització de l'Orden PJC/297/2026.

Simplificacions: declaració individual, només rendiments del treball d'un pagador, fills computats per enter i sense deduccions autonòmiques.


## Estructura

```
backend/    API FastAPI — càlcul IRPF i SS
frontend/   HTML estàtic — desplegat a GitHub Pages
```

## Executar en local

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend** — serveix `frontend/` amb qualsevol servidor estàtic (p. ex. `python3 -m http.server 5500 -d frontend`). Des de `localhost` fa servir automàticament el backend local (`http://localhost:8000`); des de qualsevol altre domini, el de producció.
