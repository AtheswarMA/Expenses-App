from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import timedelta
import json, os

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = "spendwise-secret-key-change-in-prod"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)

CORS(app)
jwt = JWTManager(app)

DB_FILE = "db.json"

def load_db():
    if not os.path.exists(DB_FILE):
        return {"users": {}}
    with open(DB_FILE) as f:
        return json.load(f)

def save_db(db):
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=2)


# ─── Base Route ─────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def home():
    return "<h1>SpendWise Backend API is running successfully!</h1><p>The frontend can now communicate with this server.</p>"

# ─── Auth ───────────────────────────────────────────────────────────────────

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    db = load_db()
    if username in db["users"]:
        return jsonify({"error": "Username already taken"}), 409

    is_admin = (username.lower() == "superadmin")
    db["users"][username] = {
        "password": generate_password_hash(password),
        "budget": 0,
        "expenses": [],
        "is_admin": is_admin
    }
    save_db(db)

    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username, "isAdmin": is_admin}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    db = load_db()
    user = db["users"].get(username)

    if not user or not check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=username)
    is_admin = user.get("is_admin", False)
    return jsonify({"token": token, "username": username, "isAdmin": is_admin}), 200


# ─── Budget ─────────────────────────────────────────────────────────────────

@app.route("/api/budget", methods=["GET"])
@jwt_required()
def get_budget():
    username = get_jwt_identity()
    db = load_db()
    return jsonify({"budget": db["users"][username].get("budget", 0)}), 200


@app.route("/api/budget", methods=["PUT"])
@jwt_required()
def set_budget():
    username = get_jwt_identity()
    data = request.get_json()
    budget = data.get("budget")

    if budget is None or float(budget) < 0:
        return jsonify({"error": "Invalid budget"}), 400

    db = load_db()
    db["users"][username]["budget"] = float(budget)
    save_db(db)
    return jsonify({"budget": float(budget)}), 200


# ─── Expenses ────────────────────────────────────────────────────────────────

@app.route("/api/expenses", methods=["GET"])
@jwt_required()
def get_expenses():
    username = get_jwt_identity()
    db = load_db()
    expenses = db["users"][username].get("expenses", [])
    return jsonify({"expenses": expenses}), 200


@app.route("/api/expenses", methods=["POST"])
@jwt_required()
def add_expense():
    username = get_jwt_identity()
    data = request.get_json()

    category = data.get("category", "").strip()
    amount = data.get("amount")
    date = data.get("date", "").strip()  # Expected: YYYY-MM-DD

    if not category or not amount or not date:
        return jsonify({"error": "category, amount and date are required"}), 400

    try:
        amount = float(amount)
        if amount <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "Amount must be a positive number"}), 400

    expense = {"id": os.urandom(8).hex(), "category": category, "amount": amount, "date": date}

    db = load_db()
    db["users"][username]["expenses"].append(expense)
    save_db(db)

    return jsonify({"expense": expense}), 201


@app.route("/api/expenses/<expense_id>", methods=["DELETE"])
@jwt_required()
def delete_expense(expense_id):
    username = get_jwt_identity()
    db = load_db()
    user = db["users"][username]
    before = len(user["expenses"])
    user["expenses"] = [e for e in user["expenses"] if e["id"] != expense_id]

    if len(user["expenses"]) == before:
        return jsonify({"error": "Expense not found"}), 404

    save_db(db)
    return jsonify({"message": "Deleted"}), 200


# ─── Summary ─────────────────────────────────────────────────────────────────

@app.route("/api/summary", methods=["GET"])
@jwt_required()
def get_summary():
    """Returns totals per category for the last 3 months."""
    username = get_jwt_identity()
    db = load_db()
    expenses = db["users"][username].get("expenses", [])

    from datetime import date
    today = date.today()

    months = []
    for delta in [-2, -1, 0]:
        y, m = today.year, today.month + delta
        while m <= 0:
            m += 12; y -= 1
        while m > 12:
            m -= 12; y += 1
        months.append(f"{y}-{str(m).zfill(2)}")

    summary = {}
    for month_key in months:
        monthly = [e for e in expenses if e["date"].startswith(month_key)]
        by_cat = {}
        for e in monthly:
            by_cat[e["category"]] = by_cat.get(e["category"], 0) + e["amount"]
        summary[month_key] = {"total": sum(by_cat.values()), "by_category": by_cat}

    return jsonify({"summary": summary, "months": months}), 200


# ─── Admin ───────────────────────────────────────────────────────────────────

@app.route("/api/admin/users", methods=["GET"])
@jwt_required()
def admin_get_users():
    username = get_jwt_identity()
    db = load_db()
    if not db["users"].get(username, {}).get("is_admin"):
        return jsonify({"error": "Unauthorized"}), 403
        
    users_data = []
    for uname, data in db["users"].items():
        if uname != username: # Don't list the admin themselves
            users_data.append({
                "username": uname,
                "budget": data.get("budget", 0),
                "totalExpenses": sum(e["amount"] for e in data.get("expenses", [])),
                "expenseCount": len(data.get("expenses", []))
            })
            
    return jsonify({"users": users_data}), 200

@app.route("/api/admin/users/<target>", methods=["DELETE"])
@jwt_required()
def admin_delete_user(target):
    username = get_jwt_identity()
    db = load_db()
    
    if not db["users"].get(username, {}).get("is_admin"):
        return jsonify({"error": "Unauthorized"}), 403
        
    if target in db["users"] and target != username:
        del db["users"][target]
        save_db(db)
        return jsonify({"message": "User deleted"}), 200
        
    return jsonify({"error": "User not found or cannot delete self"}), 400


if __name__ == "__main__":
    app.run(debug=True, port=5000)
