# Backend

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Notes

- Development defaults to `sqlite:///./app.db`
- Production should point `QMDH_DATABASE_URL` to PostgreSQL
- Default frontend origin is `http://127.0.0.1:18080`
- `QMDH_TASK_EXECUTION_MODE` supports `sync`, `background`, `redis`
- API base path: `/api/v1`
- Media previews are served from `QMDH_MEDIA_ROOT` under `QMDH_MEDIA_URL_PREFIX`
- To enable a real image provider, fill either `backend/.env` or the repo-root `.env` and set `QMDH_OPENAI_IMAGE_API_KEY`
- To add more real image providers later, fill `QMDH_IMAGE_PROVIDER_PROFILES_JSON` with additional OpenAI-compatible provider profiles

## Redis Worker

```bash
python -m app.worker
```
