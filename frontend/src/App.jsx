import { useState, useEffect, useRef } from "react";
import { Chart, ArcElement, Tooltip, Legend, DoughnutController } from "chart.js";
Chart.register(ArcElement, Tooltip, Legend, DoughnutController);

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const CATEGORIES = ["Food","Transport","Shopping","Health","Entertainment","Utilities","Education","Other"];
const CAT_COLORS  = ["#1D9E75","#378ADD","#D4537E","#E24B4A","#BA7517","#7F77DD","#639922","#888780"];

function getMonthKey(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1, 1).toLocaleString("default", { month: "short", year: "numeric" });
}

// ─── API helpers ─────────────────────────────────────────────────────────────
async function api(path, method = "GET", body, token) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Server HTTP ${res.status}: Is the backend running?` };
    return data;
  } catch (err) {
    return { error: "Network error! Did you set VITE_API_URL correctly? Or wait 50s for Render to wake up." };
  }
}

// ─── PieChart component ───────────────────────────────────────────────────────
function PieChart({ data, labels, colors }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    if (!data || data.length === 0) return;
    chartRef.current = new Chart(ref.current, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "55%" },
    });
    return () => chartRef.current?.destroy();
  }, [data]);
  return <canvas ref={ref} />;
}

// ─── Auth screen ─────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ username: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.username || !form.password) return setErr("Please fill all fields.");
    setLoading(true);
    setErr("");
    const res = await api(`/${tab}`, "POST", form);
    setLoading(false);
    if (res.error) return setErr(res.error);
    onLogin(res.token, res.username, res.isAdmin);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="logo">Spend<span>Wise</span></h1>
        <p className="subtitle">Track your monthly expenses</p>
        <div className="tab-row">
          {["login","register"].map(t => (
            <button key={t} className={`tab-btn ${tab===t?"active":""}`} onClick={() => { setTab(t); setErr(""); }}>
              {t === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        {err && <p className="err">{err}</p>}
        <div className="field"><label>Username</label><input value={form.username} onChange={set("username")} placeholder="yourname" /></div>
        <div className="field"><label>Password</label><input type="password" value={form.password} onChange={set("password")} placeholder="••••••" onKeyDown={e => e.key==="Enter" && submit()} /></div>
        <button className="btn-primary" onClick={submit} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
          {loading ? "Connecting... (May take 50s)" : (tab === "login" ? "Sign in" : "Create account")}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ token, username, onLogout }) {
  const [summary, setSummary] = useState({});
  const [months, setMonths] = useState([]);
  const [allMonths, setAllMonths] = useState([]);
  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [selMonth, setSelMonth] = useState(getMonthKey(0));
  const [form, setForm] = useState({ category: "", amount: "", date: "" });
  const [formErr, setFormErr] = useState("");

  async function refresh() {
    const [s, b, e] = await Promise.all([
      api("/summary", "GET", undefined, token),
      api("/budget",  "GET", undefined, token),
      api("/expenses","GET", undefined, token),
    ]);
    if (s.summary) { setSummary(s.summary); setMonths(s.months || []); }
    if (b.budget !== undefined) { setBudget(b.budget); setBudgetInput(b.budget || ""); }
    if (e.expenses) {
      setExpenses(e.expenses);
      const unique = new Set(s.months || []);
      e.expenses.forEach(exp => unique.add(exp.date.substring(0, 7)));
      setAllMonths(Array.from(unique).sort().reverse());
    }
  }
  useEffect(() => { refresh(); }, []);

  async function saveBudget() {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val < 0) return;
    await api("/budget", "PUT", { budget: val }, token);
    setBudget(val);
  }

  async function addExpense() {
    const { category, amount, date } = form;
    if (!category || !amount || !date) return setFormErr("All fields are required.");
    const res = await api("/expenses", "POST", { category, amount: parseFloat(amount), date }, token);
    if (res.error) return setFormErr(res.error);
    setForm({ category: "", amount: "", date: "" });
    setFormErr("");
    refresh();
  }

  async function deleteExpense(id) {
    await api(`/expenses/${id}`, "DELETE", undefined, token);
    refresh();
  }

  const selExp = expenses.filter(e => e.date.startsWith(selMonth)).sort((a,b) => b.date.localeCompare(a.date));
  const monthTotal = selExp.reduce((s,e)=>s+e.amount, 0);
  const pct = budget > 0 ? Math.min((monthTotal / budget) * 100, 100) : 0;

  const catsObj = {};
  selExp.forEach(e => { catsObj[e.category] = (catsObj[e.category] || 0) + e.amount; });
  const chartCats = Object.keys(catsObj);
  const chartVals = chartCats.map(c => catsObj[c]);
  const chartCols = chartCats.map(c => CAT_COLORS[CATEGORIES.indexOf(c)] || "#888");

  return (
    <div className="app">
      <header className="header">
        <div className="h-logo">Spend<span>Wise</span></div>
        <div className="h-right">
          <div className="avatar">{username.slice(0,2).toUpperCase()}</div>
          <span className="uname">{username}</span>
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="main">
        {/* LEFT PANEL */}
        <div>
          <div className="panel">
            <p className="panel-title">Monthly budget</p>
            <div className="budget-row">
              <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} placeholder="Set budget..." />
              <button onClick={saveBudget}>Save</button>
            </div>
            {budget > 0 && <>
              <div className="budget-stat"><div className="bs-label">Budget</div><div className="bs-value">₹{budget.toLocaleString()}</div></div>
              <div className="budget-stat"><div className="bs-label">Spent in {monthLabel(selMonth)}</div><div className={`bs-value ${monthTotal>budget?"over":""}`}>₹{monthTotal.toLocaleString()}</div></div>
              <div className="budget-stat"><div className="bs-label">Remaining</div>
                <div className={`bs-value ${budget-monthTotal<0?"over":"ok"}`}>
                  {budget-monthTotal<0 ? `Over by ₹${(monthTotal-budget).toLocaleString()}` : `₹${(budget-monthTotal).toLocaleString()}`}
                </div>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%`, background: pct>90?"#E24B4A":pct>70?"#BA7517":"#1D9E75" }} />
              </div>
            </>}
          </div>

          <div className="panel" style={{ marginTop: "1rem" }}>
            <p className="panel-title">Add expense</p>
            {formErr && <p className="err">{formErr}</p>}
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}>
                <option value="">Select...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field"><label>Amount (₹)</label><input type="number" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} placeholder="0" /></div>
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} /></div>
            </div>
            <button className="btn-add" onClick={addExpense}>+ Add expense</button>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div>
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <p className="panel-title">{monthLabel(selMonth)} breakdown</p>
            <div className="chart-card" style={{ maxWidth: "420px", margin: "0 auto", padding: "1.5rem" }}>
              <div style={{ position:"relative", height:"180px" }}>
                <PieChart data={chartVals} labels={chartCats} colors={chartCols} />
              </div>
              <div className="chart-total" style={{ fontSize: "16px", marginTop: "16px", fontWeight: "500", color: "#1a1a18", textAlign: "center" }}>
                {chartVals.length > 0 ? `Total: ₹${monthTotal.toLocaleString()}` : "No data"}
              </div>
              <div className="legend" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "20px" }}>
                {chartCats.map((c, j) => (
                  <div key={c} className="legend-item" style={{ fontSize: "12px", borderBottom: "0.5px solid rgba(0,0,0,0.05)", paddingBottom: "4px" }}>
                    <div className="legend-dot" style={{ background: chartCols[j] }} />
                    <span>{c}</span>
                    <span style={{ marginLeft:"auto" }}>₹{catsObj[c].toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <p className="panel-title">Expenses</p>
            <div className="month-tabs">
              {allMonths.map(m => (
                <button key={m} className={`m-tab ${selMonth===m?"active":""}`} onClick={() => setSelMonth(m)}>{monthLabel(m)}</button>
              ))}
            </div>
            {selExp.length === 0
              ? <p className="no-exp">No expenses for this month</p>
              : <>
                <div className="expense-list">
                  {selExp.map(e => {
                    const ci = CATEGORIES.indexOf(e.category);
                    return (
                      <div key={e.id} className="exp-row">
                        <div className="exp-cat">
                          <div className="cat-dot" style={{ background: ci>=0?CAT_COLORS[ci]:"#888" }} />
                          <div><div className="exp-name">{e.category}</div><div className="exp-date">{e.date}</div></div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                          <div className="exp-amt">₹{e.amount.toLocaleString()}</div>
                          <button className="del-btn" onClick={() => deleteExpense(e.id)}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="exp-total">Total: ₹{selExp.reduce((s,e)=>s+e.amount,0).toLocaleString()}</div>
              </>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Dashboard ─────────────────────────────────────────────────────────
function AdminDashboard({ token, username, onLogout }) {
  const [users, setUsers] = useState([]);

  async function loadUsers() {
    const res = await api("/admin/users", "GET", undefined, token);
    if (res.users) setUsers(res.users);
  }
  useEffect(() => { loadUsers(); }, []);

  async function deleteUser(target) {
    if (!window.confirm(`Delete user ${target}?`)) return;
    await api(`/admin/users/${target}`, "DELETE", undefined, token);
    loadUsers();
  }

  return (
    <div className="app admin-app">
      <header className="header admin-header">
        <div className="h-logo">Admin<span>Panel</span></div>
        <div className="h-right">
          <div className="avatar admin-avatar">{username.slice(0,2).toUpperCase()}</div>
          <span className="uname">{username}</span>
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
        </div>
      </header>
      <div className="main" style={{ display: "block" }}>
        <div className="panel" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <p className="panel-title">Registered Users Overview</p>
          {users.length === 0 ? <p className="no-exp">No other users found.</p> :
            <div className="admin-table">
              <div className="at-row at-head">
                <div>Username</div>
                <div>Expenses Logged</div>
                <div>Total Spent</div>
                <div>Budget Limit</div>
                <div>Actions</div>
              </div>
              {users.map(u => (
                <div key={u.username} className="at-row">
                  <div style={{fontWeight:"500", color:"#1a1a18"}}>{u.username}</div>
                  <div>{u.expenseCount} entries</div>
                  <div>₹{u.totalExpenses.toLocaleString()}</div>
                  <div>{u.budget > 0 ? `₹${u.budget.toLocaleString()}` : "Not set"}</div>
                  <div>
                    <button className="delete-user-btn" onClick={() => deleteUser(u.username)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(() => {
    const t = localStorage.getItem("sw_token");
    const u = localStorage.getItem("sw_user");
    const a = localStorage.getItem("sw_admin") === "true";
    return t && u ? { token: t, username: u, isAdmin: a } : null;
  });

  function handleLogin(token, username, isAdmin) {
    localStorage.setItem("sw_token", token);
    localStorage.setItem("sw_user", username);
    localStorage.setItem("sw_admin", isAdmin);
    setAuth({ token, username, isAdmin });
  }
  function handleLogout() {
    localStorage.removeItem("sw_token");
    localStorage.removeItem("sw_user");
    localStorage.removeItem("sw_admin");
    setAuth(null);
  }

  return auth
    ? (auth.isAdmin ? <AdminDashboard token={auth.token} username={auth.username} onLogout={handleLogout} />
                    : <Dashboard token={auth.token} username={auth.username} onLogout={handleLogout} />)
    : <AuthScreen onLogin={handleLogin} />;
}
