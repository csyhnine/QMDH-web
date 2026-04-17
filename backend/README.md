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
- Default frontend origin is `http://localhost:5180`
- `QMDH_TASK_EXECUTION_MODE` supports `sync`, `background`, `redis`
- API base path: `/api/v1`

## Redis Worker

```bash
python -m app.worker
```
