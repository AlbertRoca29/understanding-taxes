# Calculadora IRPF

Calcula el sou net a partir del brut tenint en compte les cotitzacions a la Seguretat Social, la retenció d'IRPF (escales 2026 estatal i catalana) i la situació familiar. Inclou una eina per veure quant et queda realment d'una pujada de sou.

El càlcul està fet basant-se en l'algorisme públic de l'Agència Tributaria [EJERCICIO_2026](https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/ALGORITMO_2026.pdf)


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

**Frontend** — obre `frontend/index.html` directament al navegador o amb qualsevol servidor estàtic. Per usar el backend local, canvia `API_BASE` als fitxers HTML a `http://localhost:8000`.
