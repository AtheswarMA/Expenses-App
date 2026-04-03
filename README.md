# SpendWise — Expense Tracker

A full-stack expense analysis app with a **React** frontend and **Python (Flask)** backend.

---

## Project structure

```
expense-app/
├── backend/
│   ├── app.py           ← Flask REST API
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx      ← React app
        └── App.css
```

---

## Backend setup (Python + Flask)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The server runs on **http://localhost:5000**.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/register | Create account |
| POST | /api/login | Sign in, get JWT |
| GET  | /api/budget | Get current budget |
| PUT  | /api/budget | Set monthly budget |
| GET  | /api/expenses | List all expenses |
| POST | /api/expenses | Add expense `{category, amount, date}` |
| DELETE | /api/expenses/:id | Remove an expense |
| GET  | /api/summary | Category totals for last 3 months |

---

## Frontend setup (React + Vite)

```bash
cd frontend
npm create vite@latest . -- --template react
npm install chart.js
# Copy App.jsx and App.css into src/
npm run dev
```

Open **http://localhost:5173**.

---

## Features

- **Login / Register** — JWT-authenticated sessions
- **Budget tracker** — Set a monthly limit with visual progress bar
- **Add expenses** — Enter category, amount, and date
- **3-month overview** — Doughnut charts for past 2 months + current
- **Expense list** — Filter by month, delete entries
- **Persistent storage** — Data saved to `db.json` on the server

---

## Demo credentials
- Username: `admin`  Password: `admin123`
