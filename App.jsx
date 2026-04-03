import { useState, useEffect, useRef } from "react";
import { Chart, ArcElement, Tooltip, Legend, DoughnutController } from "chart.js";
Chart.register(ArcElement, Tooltip, Legend, DoughnutController);

const API = "http://localhost:5000/api";
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
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
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
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.username || !form.password) return setErr("Please fill all fields.");
    const res = await api(`/${tab}`, "POST", form);
    if (res.error) return setErr(res.error);
    onLogin(res.token, res.username);
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
        <button className="btn-primary" onClick={submit}>{tab === "login" ? "Sign in" : "Create account"}</button>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ token, username, onLogout }) {
  const [summary, setSummary] = useState({});
  const [months, setMonths] = useState([]);
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
    if (e.expenses) setExpenses(e.expenses);
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

  const curKey  = getMonthKey(0);
  const curTotal = summary[curKey]?.total || 0;
  const pct      = budget > 0 ? Math.min((curTotal / budget) * 100, 100) : 0;
  const selExp   = expenses.filter(e => e.date.startsWith(selMonth)).sort((a,b) => b.date.localeCompare(a.date));

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
              <div className="budget-stat"><div className="bs-label">Spent this month</div><div className={`bs-value ${curTotal>budget?"over":""}`}>₹{curTotal.toLocaleString()}</div></div>
              <div className="budget-stat"><div className="bs-label">Remaining</div>
                <div className={`bs-value ${budget-curTotal<0?"over":"ok"}`}>
                  {budget-curTotal<0 ? `Over by ₹${(curTotal-budget).toLocaleString()}` : `₹${(budget-curTotal).toLocaleString()}`}
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
            <p className="panel-title">3-month overview</p>
            <div className="charts-row">
              {months.map((m, i) => {
                const ms = summary[m] || {};
                const cats = Object.keys(ms.by_category || {});
                const vals = cats.map(c => ms.by_category[c]);
                const cols = cats.map(c => CAT_COLORS[CATEGORIES.indexOf(c)] || "#888");
                return (
                  <div key={m} className="chart-card">
                    <div className="chart-label">{i===2?"Current month":"Past month"}</div>
                    <div className="chart-month">{monthLabel(m)}</div>
                    <div style={{ position:"relative", height:"120px" }}>
                      <PieChart data={vals} labels={cats} colors={cols} />
                    </div>
                    <div className="chart-total">{vals.length>0 ? `₹${(ms.total||0).toLocaleString()}` : "No data"}</div>
                    <div className="legend">
                      {cats.map((c,j) => (
                        <div key={c} className="legend-item">
                          <div className="legend-dot" style={{ background: cols[j] }} />
                          <span>{c}</span>
                          <span style={{ marginLeft:"auto" }}>₹{ms.by_category[c].toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <p className="panel-title">Expenses</p>
            <div className="month-tabs">
              {months.map(m => (
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

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(() => {
    const t = localStorage.getItem("sw_token");
    const u = localStorage.getItem("sw_user");
    return t && u ? { token: t, username: u } : null;
  });

  function handleLogin(token, username) {
    localStorage.setItem("sw_token", token);
    localStorage.setItem("sw_user", username);
    setAuth({ token, username });
  }
  function handleLogout() {
    localStorage.removeItem("sw_token");
    localStorage.removeItem("sw_user");
    setAuth(null);
  }

  return auth
    ? <Dashboard token={auth.token} username={auth.username} onLogout={handleLogout} />
    : <AuthScreen onLogin={handleLogin} />;
}
