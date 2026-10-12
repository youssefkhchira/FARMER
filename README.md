# Herdbook

Herdbook is a Django-backed farm animal register. It keeps the existing English,
French, and Arabic interface while storing accounts and farm records in SQLite
instead of browser local storage.

## Run locally

```sh
/bin/python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open <http://127.0.0.1:8000/>. Accounts are created in Django's auth system;
passwords are hashed by Django and browser sessions are protected by Django's
CSRF middleware. Animal, health, and event records are stored as related
database models and isolated by the authenticated account.

## Configuration

Set `DJANGO_SECRET_KEY` to a unique, private value and configure
`DJANGO_ALLOWED_HOSTS` before deployment. Set `DJANGO_DEBUG=0` in production.
The default secret is only suitable for local development.

The JSON backup import/export and CSV animal export remain available in the
interface. SQLite data is persisted in `db.sqlite3`; back up that file as well
as any JSON exports.

## Frontend files

The Django page template is `herd/templates/herd/home.html`. Its responsive
styles, app logic, shared animal/event constants, and English/French/Arabic
translations are kept separately in `herd/static/herd/`.
