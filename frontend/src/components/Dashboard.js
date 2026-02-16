import React from 'react';
import { TrendingUp, Phone, Calendar, DollarSign, Gift, Clock, Target, Banknote, Play, Pause, RotateCcw } from 'lucide-react';
import { getStoredSettings } from './Settings';

const KPICard = ({ label, value, goal, progress, status, icon: Icon, prefix = '' }) => {
  const getProgressColor = () => {
    if (progress >= 100) return 'success';
    if (progress >= 75) return 'warning';
    return 'danger';
  };

  return (
    <div className="card kpi-card" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="kpi-label">{label}</span>
        {Icon && <Icon size={18} style={{ color: 'var(--text-tertiary)' }} />}
      </div>
      <div className="kpi-value">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="progress-bar">
        <div 
          className={`progress-fill ${getProgressColor()}`} 
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <div className="kpi-meta">
        {value >= goal ? (
          <span className={`badge on_track`}>✓ Goal reached!</span>
        ) : (
          <span>{prefix}{(goal - value).toLocaleString()} more needed</span>
        )}
      </div>
    </div>
  );
};

const Skeleton = ({ height = 120 }) => (
  <div className="card skeleton" style={{ height }} />
);

function Dashboard({ stats, todayEntry, periodInfo, goals, loading, customSettings, timer }) {
  // Get custom settings or defaults
  const settings = customSettings || getStoredSettings();
  const EXCHANGE_RATE = settings.conversion?.exchange_rate || 15.86;
  const PERIOD_FEE_PESOS = settings.conversion?.period_fee || 100;
  const customGoals = settings.goals || {};

  // Timer from props (shared with App)
  const { timerSeconds, isTimerRunning, isPaused, startTimer, pauseTimer, resumeTimer, stopTimer } = timer || {};

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div>
        <div className="section">
          <div className="skeleton" style={{ height: 32, width: 200, marginBottom: '1rem' }} />
          <div className="grid grid-4">
            {[1,2,3,4].map(i => <Skeleton key={i} />)}
          </div>
        </div>
        <div className="section">
          <div className="skeleton" style={{ height: 32, width: 200, marginBottom: '1rem' }} />
          <div className="grid grid-3">
            {[1,2,3].map(i => <Skeleton key={i} height={140} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div data-testid="dashboard">
      {/* Timer Bar - Always Visible */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#1a1a1a', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
            {/* Current Timer */}
            <div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '2px' }}>CURRENT</div>
              <div className="font-display" style={{ fontSize: '2.5rem', fontWeight: 900 }}>{formatTime(timerSeconds)}</div>
            </div>
            {/* Last Booking Time */}
            <div style={{ borderLeft: '1px solid #444', paddingLeft: '1.5rem' }}>
              <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '2px' }}>LAST BOOKING</div>
              <div className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {(() => {
                  const bookings = todayEntry?.bookings || [];
                  if (bookings.length === 0) return '—';
                  const lastBooking = bookings[bookings.length - 1];
                  return `${lastBooking.time_since_last || 0} min`;
                })()}
              </div>
            </div>
            {/* Period Average */}
            <div style={{ borderLeft: '1px solid #444', paddingLeft: '1.5rem' }}>
              <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '2px' }}>PERIOD AVG</div>
              <div className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {stats?.avg_time?.average || 0} min
              </div>
            </div>
            {isPaused && <span style={{ background: '#F59E0B', color: '#000', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>PAUSED</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!isTimerRunning ? (
              <button onClick={startTimer} data-testid="start-timer-btn" style={{ background: '#34C759', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '30px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                <Play size={20} /> START
              </button>
            ) : isPaused ? (
              <button onClick={resumeTimer} data-testid="resume-timer-btn" style={{ background: '#34C759', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '30px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                <Play size={20} /> RESUME
              </button>
            ) : (
              <button onClick={pauseTimer} data-testid="pause-timer-btn" style={{ background: '#F59E0B', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '30px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                <Pause size={20} /> PAUSE
              </button>
            )}
            <button onClick={stopTimer} data-testid="stop-timer-btn" style={{ background: '#FF3B30', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '30px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
              <RotateCcw size={20} /> STOP
            </button>
          </div>
        </div>
      </div>

      {/* Period Info Banner */}
      <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--primary)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>Current Period</div>
            <div className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {periodInfo?.start_date} → {periodInfo?.end_date}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900 }} className="font-display">
              {periodInfo?.days_remaining}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>DAYS LEFT</div>
          </div>
        </div>
      </div>

      {/* Today's Activity - TOP */}
      <div className="section">
        <h2 className="section-title"><Clock size={20} /> Today's Activity</h2>
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
            <div>
              <div className="kpi-label">Calls</div>
              <div className="font-display" style={{ fontSize: '2rem', fontWeight: 700 }}>
                {todayEntry?.calls_received || 0}
              </div>
            </div>
            <div>
              <div className="kpi-label">Bookings</div>
              <div className="font-display" style={{ fontSize: '2rem', fontWeight: 700 }}>
                {todayEntry?.bookings?.length || 0}
              </div>
            </div>
            <div>
              <div className="kpi-label">Spins</div>
              <div className="font-display" style={{ fontSize: '2rem', fontWeight: 700 }}>
                {todayEntry?.spins?.length || 0}
              </div>
            </div>
            <div>
              <div className="kpi-label">Misc Income</div>
              <div className="font-display" style={{ fontSize: '2rem', fontWeight: 700 }}>
                {todayEntry?.misc_income?.length || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance - TOP */}
      <div className="section">
        <h2 className="section-title"><TrendingUp size={20} /> Performance</h2>
        <div className="grid grid-4">
          <div className="card kpi-card">
            <span className="kpi-label">Combined Earnings</span>
            <div className="kpi-value">${stats.combined.total.toLocaleString()}</div>
            <div className="progress-bar">
              <div 
                className={`progress-fill ${stats.combined.status === 'on_track' ? 'success' : stats.combined.status === 'warning' ? 'warning' : 'danger'}`}
                style={{ width: `${Math.min(stats.combined.progress_percent, 100)}%` }}
              />
            </div>
            <div className="kpi-meta">
              {stats.combined.total >= stats.combined.goal ? (
                <span className={`badge on_track`}>✓ Goal reached!</span>
              ) : (
                <span>${(stats.combined.goal - stats.combined.total).toLocaleString()} more needed</span>
              )}
            </div>
          </div>

          {/* Spin Progress - Only Prepaid Count */}
          <div className="card kpi-card" style={{ background: '#FEF3C7', border: '2px solid #F59E0B' }}>
            <span className="kpi-label" style={{ color: '#92400E' }}>Spin Progress</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span className="kpi-value" style={{ color: '#78350F' }}>{stats.reservations.prepaid_count || 0}</span>
              <span style={{ fontSize: '1rem', color: '#92400E' }}>prepaid</span>
            </div>
            <div className="progress-bar" style={{ background: '#FDE68A' }}>
              <div 
                className="progress-fill"
                style={{ 
                  width: `${((stats.reservations.prepaid_count || 0) % 4) / 4 * 100}%`,
                  background: '#F59E0B'
                }}
              />
            </div>
            <div className="kpi-meta" style={{ color: '#92400E' }}>
              {4 - ((stats.reservations.prepaid_count || 0) % 4)} more prepaid → next spin
              {((stats.reservations.prepaid_count || 0) % 16) >= 12 && (
                <span className="badge" style={{ background: '#7C3AED', color: 'white', marginLeft: '0.5rem' }}>MEGA next!</span>
              )}
            </div>
          </div>

          <div className="card kpi-card">
            <span className="kpi-label">Conversion Rate</span>
            <div className="kpi-value">{stats.conversion_rate.rate}%</div>
            <div className="kpi-meta">
              Goal: {stats.conversion_rate.goal}%
              <span className={`badge ${stats.conversion_rate.status}`} style={{ marginLeft: '0.5rem' }}>
                {stats.conversion_rate.on_track ? '✓' : '⚠'}
              </span>
            </div>
          </div>

          <div className="card kpi-card">
            <span className="kpi-label">Avg Time/Booking</span>
            <div className="kpi-value" style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
              {stats.avg_time.average}
              <span style={{ fontSize: '1rem', fontWeight: 500 }}>min</span>
            </div>
            <div className="kpi-meta">
              Actual avg • Goal: ≤{stats.avg_time.goal} min
              <span className={`badge ${stats.avg_time.status}`} style={{ marginLeft: '0.5rem' }}>
                {stats.avg_time.on_track ? '✓' : '⚠'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Peso Conversion Section */}
      <div className="section">
        <h2 className="section-title"><Banknote size={20} /> Pesos Conversion (Rate: {EXCHANGE_RATE})</h2>
        <div className="grid grid-2">
          {/* Daily Pesos - Actual today's earnings, NO FEE */}
          <div className="card" style={{ background: '#FEF3C7', border: '2px solid #F59E0B' }}>
            <span className="kpi-label" style={{ color: '#92400E' }}>Today's Earnings</span>
            <div className="font-display" style={{ fontSize: '2rem', fontWeight: 900, color: '#78350F' }}>
              ${(() => {
                const todayProfit = todayEntry?.bookings?.reduce((sum, b) => sum + (b.profit || 0), 0) || 0;
                const todaySpins = todayEntry?.spins?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
                const todayMisc = todayEntry?.misc_income?.reduce((sum, m) => sum + (m.amount || 0), 0) || 0;
                return ((todayProfit + todaySpins + todayMisc) * EXCHANGE_RATE).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()} MXN
            </div>
            <div style={{ fontSize: '0.875rem', color: '#92400E', marginTop: '0.5rem' }}>
              ${(() => {
                const todayProfit = todayEntry?.bookings?.reduce((sum, b) => sum + (b.profit || 0), 0) || 0;
                const todaySpins = todayEntry?.spins?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
                const todayMisc = todayEntry?.misc_income?.reduce((sum, m) => sum + (m.amount || 0), 0) || 0;
                return (todayProfit + todaySpins + todayMisc).toFixed(2);
              })()} USD
            </div>
          </div>

          {/* Pay Period - Shows gross and net after fee */}
          <div className="card" style={{ background: '#D1FAE5', border: '2px solid #10B981' }}>
            <span className="kpi-label" style={{ color: '#065F46' }}>Pay Period Total</span>
            <div className="font-display" style={{ fontSize: '2rem', fontWeight: 900, color: '#064E3B' }}>
              ${((stats.combined.total * EXCHANGE_RATE) - PERIOD_FEE_PESOS).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
            </div>
            <div style={{ fontSize: '0.875rem', color: '#065F46', marginTop: '0.5rem' }}>
              ${(stats.combined.total * EXCHANGE_RATE).toFixed(2)} gross − {PERIOD_FEE_PESOS} fee
            </div>
          </div>
        </div>
      </div>

      {/* Biweekly Progress - BOTTOM */}
      <div className="section">
        <h2 className="section-title"><Target size={20} /> Biweekly Progress</h2>
        <div className="grid grid-4">
          <KPICard 
            label="Calls" 
            value={stats.calls.total} 
            goal={stats.calls.goal}
            progress={stats.calls.progress_percent}
            status={stats.calls.status}
            icon={Phone}
          />
          <KPICard 
            label="Reservations" 
            value={stats.reservations.total} 
            goal={stats.reservations.goal}
            progress={stats.reservations.progress_percent}
            status={stats.reservations.status}
            icon={Calendar}
          />
          <KPICard 
            label="Profit" 
            value={stats.profit.total} 
            goal={stats.profit.goal}
            progress={stats.profit.progress_percent}
            status={stats.profit.status}
            icon={DollarSign}
            prefix="$"
          />
          <KPICard 
            label="Spins" 
            value={stats.spins.total} 
            goal={stats.spins.goal}
            progress={stats.spins.progress_percent}
            status={stats.spins.status}
            icon={Gift}
            prefix="$"
          />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
