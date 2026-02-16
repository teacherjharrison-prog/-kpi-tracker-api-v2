import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw, DollarSign, Target, Phone, Calendar, Gift, Clock } from 'lucide-react';

const DEFAULT_GOALS = {
  calls_biweekly: 1710,
  calls_daily: 142,
  reservations_biweekly: 270,
  reservations_daily: 22,
  profit_biweekly: 865.00,
  profit_daily: 72.08,
  spins_biweekly: 890.00,
  spins_daily: 74.17,
  combined_biweekly: 1800.00,
  misc_biweekly: 35.00,
  avg_time_per_booking: 30,
};

const DEFAULT_CONVERSION = {
  exchange_rate: 15.86,
  period_fee: 100,
};

function Settings({ onSettingsChange }) {
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [conversion, setConversion] = useState(DEFAULT_CONVERSION);
  const [saved, setSaved] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedGoals = localStorage.getItem('kpi_goals');
    const savedConversion = localStorage.getItem('kpi_conversion');
    
    if (savedGoals) {
      setGoals(JSON.parse(savedGoals));
    }
    if (savedConversion) {
      setConversion(JSON.parse(savedConversion));
    }
  }, []);

  const handleGoalChange = (key, value) => {
    setGoals(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  const handleConversionChange = (key, value) => {
    setConversion(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  const saveSettings = () => {
    localStorage.setItem('kpi_goals', JSON.stringify(goals));
    localStorage.setItem('kpi_conversion', JSON.stringify(conversion));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (onSettingsChange) {
      onSettingsChange({ goals, conversion });
    }
  };

  const resetToDefaults = () => {
    setGoals(DEFAULT_GOALS);
    setConversion(DEFAULT_CONVERSION);
    localStorage.removeItem('kpi_goals');
    localStorage.removeItem('kpi_conversion');
    if (onSettingsChange) {
      onSettingsChange({ goals: DEFAULT_GOALS, conversion: DEFAULT_CONVERSION });
    }
  };

  const GoalInput = ({ label, icon: Icon, value, onChange, prefix = '' }) => (
    <div className="form-group">
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {Icon && <Icon size={14} />} {label}
      </label>
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}>
            {prefix}
          </span>
        )}
        <input
          type="number"
          step="0.01"
          className="form-input"
          style={{ paddingLeft: prefix ? '28px' : '12px' }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <div data-testid="settings">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 className="section-title font-display" style={{ fontSize: '2rem', margin: 0 }}>
          <SettingsIcon size={24} /> Settings
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-secondary" 
            onClick={resetToDefaults}
            data-testid="reset-defaults-btn"
          >
            <RotateCcw size={16} /> Reset Defaults
          </button>
          <button 
            className="btn btn-primary" 
            onClick={saveSettings}
            style={{ background: saved ? 'var(--success)' : 'var(--primary)' }}
            data-testid="save-settings-btn"
          >
            <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Peso Conversion Settings */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#FEF3C7', border: '2px solid #F59E0B' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#92400E' }}>
          <DollarSign size={20} /> Peso Conversion Settings
        </h3>
        <div className="grid grid-2" style={{ gap: '1rem' }}>
          <GoalInput
            label="Exchange Rate (USD → MXN)"
            value={conversion.exchange_rate}
            onChange={(v) => handleConversionChange('exchange_rate', v)}
          />
          <GoalInput
            label="Period Fee (Pesos)"
            value={conversion.period_fee}
            onChange={(v) => handleConversionChange('period_fee', v)}
            prefix="$"
          />
        </div>
        <p style={{ fontSize: '0.875rem', color: '#92400E', marginTop: '1rem' }}>
          Current: $1 USD = ${conversion.exchange_rate} MXN | Period fee: ${conversion.period_fee} MXN
        </p>
      </div>

      {/* Biweekly Goals */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Target size={20} /> Biweekly Goals (Pay Period)
        </h3>
        <div className="grid grid-3" style={{ gap: '1rem' }}>
          <GoalInput
            label="Calls"
            icon={Phone}
            value={goals.calls_biweekly}
            onChange={(v) => handleGoalChange('calls_biweekly', v)}
          />
          <GoalInput
            label="Reservations"
            icon={Calendar}
            value={goals.reservations_biweekly}
            onChange={(v) => handleGoalChange('reservations_biweekly', v)}
          />
          <GoalInput
            label="Profit"
            icon={DollarSign}
            value={goals.profit_biweekly}
            onChange={(v) => handleGoalChange('profit_biweekly', v)}
            prefix="$"
          />
          <GoalInput
            label="Spins"
            icon={Gift}
            value={goals.spins_biweekly}
            onChange={(v) => handleGoalChange('spins_biweekly', v)}
            prefix="$"
          />
          <GoalInput
            label="Combined Earnings"
            icon={DollarSign}
            value={goals.combined_biweekly}
            onChange={(v) => handleGoalChange('combined_biweekly', v)}
            prefix="$"
          />
          <GoalInput
            label="Misc Income"
            icon={DollarSign}
            value={goals.misc_biweekly}
            onChange={(v) => handleGoalChange('misc_biweekly', v)}
            prefix="$"
          />
        </div>
      </div>

      {/* Daily Goals */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Clock size={20} /> Daily Goals
        </h3>
        <div className="grid grid-3" style={{ gap: '1rem' }}>
          <GoalInput
            label="Calls"
            icon={Phone}
            value={goals.calls_daily}
            onChange={(v) => handleGoalChange('calls_daily', v)}
          />
          <GoalInput
            label="Reservations"
            icon={Calendar}
            value={goals.reservations_daily}
            onChange={(v) => handleGoalChange('reservations_daily', v)}
          />
          <GoalInput
            label="Profit"
            icon={DollarSign}
            value={goals.profit_daily}
            onChange={(v) => handleGoalChange('profit_daily', v)}
            prefix="$"
          />
          <GoalInput
            label="Spins"
            icon={Gift}
            value={goals.spins_daily}
            onChange={(v) => handleGoalChange('spins_daily', v)}
            prefix="$"
          />
          <GoalInput
            label="Avg Time per Booking (min)"
            icon={Clock}
            value={goals.avg_time_per_booking}
            onChange={(v) => handleGoalChange('avg_time_per_booking', v)}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="card" style={{ background: '#f9f9f9' }}>
        <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Quick Reference</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.875rem' }}>
          <div><strong>Biweekly Calls:</strong> {goals.calls_biweekly.toLocaleString()}</div>
          <div><strong>Biweekly Reservations:</strong> {goals.reservations_biweekly}</div>
          <div><strong>Biweekly Profit:</strong> ${goals.profit_biweekly}</div>
          <div><strong>Biweekly Spins:</strong> ${goals.spins_biweekly}</div>
          <div><strong>Combined Target:</strong> ${goals.combined_biweekly}</div>
          <div><strong>Conversion Rate:</strong> {((goals.reservations_biweekly / goals.calls_biweekly) * 100).toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );
}

export default Settings;

// Helper to get settings from localStorage
export const getStoredSettings = () => {
  const goals = localStorage.getItem('kpi_goals');
  const conversion = localStorage.getItem('kpi_conversion');
  return {
    goals: goals ? JSON.parse(goals) : DEFAULT_GOALS,
    conversion: conversion ? JSON.parse(conversion) : DEFAULT_CONVERSION,
  };
};
