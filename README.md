# Calculadora IRPF

Calcula el sou net a partir del brut tenint en compte les cotitzacions a la Seguretat Social, l'IRPF real anual (escala estatal i catalana 2026, mínim personal i familiar i deducció per rendiments del treball) i la situació familiar. Inclou una eina per veure quant et queda realment d'una pujada de sou.

La xifra principal és el que pagues de veritat (impost anual). Al costat es mostra el net que veuràs a la nòmina, calculat amb l'algorisme públic de retencions de l'Agència Tributària [EJERCICIO_2026](https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/ALGORITMO_2026.pdf), que fa servir una escala única per a tot l'Estat.

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

**Frontend** — obre `frontend/index.html` directament al navegador o amb qualsevol servidor estàtic. Si el frontend es serveix des de `localhost`, fa servir automàticament el backend a `http://localhost:8000`.
