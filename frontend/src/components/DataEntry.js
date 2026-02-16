import React, { useState, useEffect, useRef } from 'react';
import { Phone, DollarSign, Gift, Plus, Check, Loader, Play, Pause, RotateCcw, Timer } from 'lucide-react';

function DataEntry({ todayEntry, onUpdate, apiUrl }) {
  const today = new Date().toISOString().split('T')[0];
  const [loading, setLoading] = useState({});
  const [success, setSuccess] = useState({});
  
  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  
  const [calls, setCalls] = useState(todayEntry?.calls_received || 0);
  const [booking, setBooking] = useState({ profit: '', is_prepaid: false, has_refund_protection: false, time_since_last: '' });
  const [spin, setSpin] = useState({ amount: '', is_mega: false, booking_number: '' });
  const [misc, setMisc] = useState({ amount: '', source: 'request_lead', description: '' });

  // Load timer state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('kpi_timer');
    if (saved) {
      const { seconds, running, paused, lastUpdate } = JSON.parse(saved);
      if (running && !paused) {
        // Add elapsed time since last update
        const elapsed = Math.floor((Date.now() - lastUpdate) / 1000);
        setTimerSeconds(seconds + elapsed);
        setIsTimerRunning(true);
      } else {
        setTimerSeconds(seconds);
        setIsPaused(paused);
      }
    }
  }, []);

  // Timer tick
  useEffect(() => {
    if (isTimerRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isTimerRunning, isPaused]);

  // Save timer state
  useEffect(() => {
    localStorage.setItem('kpi_timer', JSON.stringify({
      seconds: timerSeconds,
      running: isTimerRunning,
      paused: isPaused,
      lastUpdate: Date.now()
    }));
  }, [timerSeconds, isTimerRunning, isPaused]);

  // Check for week reset (Sunday 12:00 AM)
  useEffect(() => {
    const checkWeekReset = () => {
      const now = new Date();
      const lastReset = localStorage.getItem('kpi_week_reset');
      const lastResetDate = lastReset ? new Date(lastReset) : null;
      
      // Find last Sunday at midnight
      const lastSunday = new Date(now);
      lastSunday.setDate(now.getDate() - now.getDay());
      lastSunday.setHours(0, 0, 0, 0);
      
      if (!lastResetDate || lastResetDate < lastSunday) {
        // New week started - could trigger reset logic here
        localStorage.setItem('kpi_week_reset', lastSunday.toISOString());
      }
    };
    checkWeekReset();
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    setIsTimerRunning(true);
    setIsPaused(false);
  };

  const pauseTimer = () => {
    setIsPaused(true);
  };

  const resumeTimer = () => {
    setIsPaused(false);
  };

  const resetTimer = () => {
    setTimerSeconds(0);
    setIsTimerRunning(false);
    setIsPaused(false);
  };

  const showSuccess = (key) => {
    setSuccess({ ...success, [key]: true });
    setTimeout(() => setSuccess({ ...success, [key]: false }), 2000);
  };

  const updateCalls = async () => {
    setLoading({ ...loading, calls: true });
    try {
      await fetch(`${apiUrl}/api/entries/${today}/calls?calls_received=${calls}`, { method: 'PUT' });
      showSuccess('calls');
      onUpdate();
    } catch (err) {
      alert('Failed to update calls');
    }
    setLoading({ ...loading, calls: false });
  };

  const addBooking = async () => {
    if (!booking.profit) return alert('Enter profit amount');
    setLoading({ ...loading, booking: true });
    
    // Use timer value for time_since_last (convert to minutes)
    const timeMinutes = Math.floor(timerSeconds / 60);
    
    try {
      await fetch(`${apiUrl}/api/entries/${today}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profit: parseFloat(booking.profit),
          is_prepaid: booking.is_prepaid,
          has_refund_protection: booking.has_refund_protection,
          time_since_last: booking.time_since_last ? parseInt(booking.time_since_last) : timeMinutes
        })
      });
      setBooking({ profit: '', is_prepaid: false, has_refund_protection: false, time_since_last: '' });
      // Reset timer after booking
      resetTimer();
      startTimer(); // Auto-start for next booking
      showSuccess('booking');
      onUpdate();
    } catch (err) {
      alert('Failed to add booking');
    }
    setLoading({ ...loading, booking: false });
  };

  const addSpin = async () => {
    if (!spin.amount) return alert('Enter spin amount');
    setLoading({ ...loading, spin: true });
    try {
      await fetch(`${apiUrl}/api/entries/${today}/spins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(spin.amount),
          is_mega: spin.is_mega,
          booking_number: parseInt(spin.booking_number) || 0
        })
      });
      setSpin({ amount: '', is_mega: false, booking_number: '' });
      showSuccess('spin');
      onUpdate();
    } catch (err) {
      alert('Failed to add spin');
    }
    setLoading({ ...loading, spin: false });
  };

  const addMisc = async () => {
    if (!misc.amount) return alert('Enter amount');
    setLoading({ ...loading, misc: true });
    try {
      await fetch(`${apiUrl}/api/entries/${today}/misc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(misc.amount),
          source: misc.source,
          description: misc.description
        })
      });
      setMisc({ amount: '', source: 'request_lead', description: '' });
      showSuccess('misc');
      onUpdate();
    } catch (err) {
      alert('Failed to add misc income');
    }
    setLoading({ ...loading, misc: false });
  };

  const ButtonContent = ({ loading: isLoading, success: isSuccess, children }) => {
    if (isLoading) return <><Loader size={16} className="animate-spin" /> Saving...</>;
    if (isSuccess) return <><Check size={16} /> Saved!</>;
    return children;
  };

  return (
    <div data-testid="data-entry">
      <h2 className="section-title font-display" style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>
        Add Data for {today}
      </h2>

      <div className="grid grid-2" style={{ gap: '1.5rem' }}>
        {/* Calls */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Phone size={20} /> Update Calls
          </h3>
          <div className="form-group">
            <label className="form-label">Total Calls Received</label>
            <input
              type="number"
              className="form-input"
              value={calls}
              onChange={(e) => setCalls(parseInt(e.target.value) || 0)}
              data-testid="calls-input"
            />
          </div>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '1rem', width: '100%' }}
            onClick={updateCalls}
            disabled={loading.calls}
            data-testid="update-calls-btn"
          >
            <ButtonContent loading={loading.calls} success={success.calls}>
              <Check size={16} /> Update Calls
            </ButtonContent>
          </button>
        </div>

        {/* Booking */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <DollarSign size={20} /> Add Booking
          </h3>
          <div className="form-group">
            <label className="form-label">Profit Amount ($)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              placeholder="0.00"
              value={booking.profit}
              onChange={(e) => setBooking({ ...booking, profit: e.target.value })}
              data-testid="booking-profit-input"
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label">Time Since Last (min)</label>
            <input
              type="number"
              className="form-input"
              placeholder="30"
              value={booking.time_since_last}
              onChange={(e) => setBooking({ ...booking, time_since_last: e.target.value })}
              data-testid="booking-time-input"
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={booking.is_prepaid}
                onChange={(e) => setBooking({ ...booking, is_prepaid: e.target.checked })}
              />
              Prepaid
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={booking.has_refund_protection}
                onChange={(e) => setBooking({ ...booking, has_refund_protection: e.target.checked })}
              />
              Refund Protection
            </label>
          </div>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '1rem', width: '100%' }}
            onClick={addBooking}
            disabled={loading.booking}
            data-testid="add-booking-btn"
          >
            <ButtonContent loading={loading.booking} success={success.booking}>
              <Plus size={16} /> Add Booking
            </ButtonContent>
          </button>
        </div>

        {/* Spin */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Gift size={20} /> Add Spin
          </h3>
          <div className="form-group">
            <label className="form-label">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              placeholder="0.00"
              value={spin.amount}
              onChange={(e) => setSpin({ ...spin, amount: e.target.value })}
              data-testid="spin-amount-input"
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label">Booking Number</label>
            <input
              type="number"
              className="form-input"
              placeholder="1"
              value={spin.booking_number}
              onChange={(e) => setSpin({ ...spin, booking_number: e.target.value })}
              data-testid="spin-booking-input"
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={spin.is_mega}
              onChange={(e) => setSpin({ ...spin, is_mega: e.target.checked })}
            />
            Mega Spin
          </label>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '1rem', width: '100%' }}
            onClick={addSpin}
            disabled={loading.spin}
            data-testid="add-spin-btn"
          >
            <ButtonContent loading={loading.spin} success={success.spin}>
              <Plus size={16} /> Add Spin
            </ButtonContent>
          </button>
        </div>

        {/* Misc Income */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <DollarSign size={20} /> Add Misc Income
          </h3>
          <div className="form-group">
            <label className="form-label">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              placeholder="0.00"
              value={misc.amount}
              onChange={(e) => setMisc({ ...misc, amount: e.target.value })}
              data-testid="misc-amount-input"
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label">Source</label>
            <select
              className="form-input"
              value={misc.source}
              onChange={(e) => setMisc({ ...misc, source: e.target.value })}
              data-testid="misc-source-select"
            >
              <option value="request_lead">Request Lead</option>
              <option value="refund_protection">Refund Protection</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="form-label">Description (optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Notes..."
              value={misc.description}
              onChange={(e) => setMisc({ ...misc, description: e.target.value })}
              data-testid="misc-desc-input"
            />
          </div>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '1rem', width: '100%' }}
            onClick={addMisc}
            disabled={loading.misc}
            data-testid="add-misc-btn"
          >
            <ButtonContent loading={loading.misc} success={success.misc}>
              <Plus size={16} /> Add Misc Income
            </ButtonContent>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataEntry;
