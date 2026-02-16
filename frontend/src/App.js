import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import DataEntry from './components/DataEntry';
import History from './components/History';
import Settings, { getStoredSettings } from './components/Settings';
import { LayoutDashboard, Plus, Clock, Settings as SettingsIcon } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [todayEntry, setTodayEntry] = useState(null);
  const [periodInfo, setPeriodInfo] = useState(null);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customSettings, setCustomSettings] = useState(getStoredSettings());

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, entryRes, periodRes, goalsRes] = await Promise.all([
        fetch(`${API_URL}/api/stats/biweekly`),
        fetch(`${API_URL}/api/entries/today`),
        fetch(`${API_URL}/api/periods/current`),
        fetch(`${API_URL}/api/goals`)
      ]);
      
      if (!statsRes.ok || !entryRes.ok || !periodRes.ok || !goalsRes.ok) {
        throw new Error('Failed to fetch data');
      }
      
      setStats(await statsRes.json());
      setTodayEntry(await entryRes.json());
      setPeriodInfo(await periodRes.json());
      setGoals(await goalsRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'add', label: 'Add Data', icon: Plus },
    { id: 'history', label: 'History', icon: Clock },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1 className="logo font-display">KPI TRACKER</h1>
          <nav className="nav">
            {tabs.map(tab => (
              <button
                key={tab.id}
                data-testid={`nav-${tab.id}`}
                className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={18} />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {error && (
          <div className="error-banner" data-testid="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={fetchData}>Retry</button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <Dashboard 
            stats={stats} 
            todayEntry={todayEntry} 
            periodInfo={periodInfo}
            goals={goals}
            loading={loading} 
          />
        )}
        {activeTab === 'add' && (
          <DataEntry 
            todayEntry={todayEntry} 
            onUpdate={fetchData}
            apiUrl={API_URL}
          />
        )}
        {activeTab === 'history' && (
          <History apiUrl={API_URL} />
        )}
      </main>
    </div>
  );
}

export default App;
