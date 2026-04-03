@echo off
echo ========================================
echo SpendWise Setup and Run Script
echo ========================================

echo 1. Setting up the Python Backend...
if not exist venv (
    python -m venv venv
)
start cmd /k ".\venv\Scripts\activate && pip install flask flask-cors flask-jwt-extended werkzeug && python app.py"

echo 2. Setting up the React Frontend...
if not exist frontend (
    mkdir frontend
)
cd frontend
:: Initialize Vite project if not already initialized
if not exist package.json (
    call npx --yes create-vite@latest . --template react
)
call npm install
call npm install chart.js

:: Copy custom files over Vite's defaults
copy ..\App.jsx src\App.jsx /Y
copy ..\App.css src\App.css /Y

:: Start frontend dev server
start cmd /k "npm run dev"

echo ========================================
echo Backend is starting in a new window (http://localhost:5000)
echo Frontend is starting in a new window (http://localhost:5173)
echo ========================================
pause
