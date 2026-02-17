import React, { useState, useEffect } from 'react';
import { Clock, ChevronRight, Check, X } from 'lucide-react';

function History({ apiUrl }) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  useEffect(() => {
    fetchPeriods();
  }, []);

  const fetchPeriods = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/periods`);
      const data = await res.json();
      setPeriods(data);
    } catch (err) {
      console.error('Failed to fetch periods:', err);
    }
    setLoading(false);
  };

  const GoalBadge = ({ met }) => (
    <span style={{ 
      display: 'inline-flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      width: 20, 
      height: 20, 
      borderRadius: '50%',
      background: met ? '#D1FAE5' : '#FEE2E2',
      color: met ? '#065F46' : '#991B1B'
    }}>
      {met ? <Check size={12} /> : <X size={12} />}
    </span>
  );

  if (loading) {
    return (
      <div data-testid="history">
        <h2 className="section-title font-display" style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>
          <Clock size={24} /> Period History
        </h2>
        <div className="grid" style={{ gap: '1rem' }}>
          {[1,2,3].map(i => (
            <div key={i} className="card skeleton" style={{ height: 80 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="history">
      <h2 className="section-title font-display" style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>
        <Clock size={24} /> Period History
      </h2>

      {periods.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No archived periods yet.</p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Periods are automatically archived at the start of each new period (1st and 15th).
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {periods.map(period => (
            <div 
              key={period.period_id} 
              className="card"
              style={{ cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={() => setSelectedPeriod(selectedPeriod?.period_id === period.period_id ? null : period)}
              data-testid={`period-${period.period_id}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="font-display" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    {period.start_date} → {period.end_date}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {period.entry_count} days tracked • ${period.totals.combined.toLocaleString()} combined
                  </div>
                </div>
                <ChevronRight 
                  size={20} 
                  style={{ 
                    color: 'var(--text-tertiary)',
                    transform: selectedPeriod?.period_id === period.period_id ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s'
                  }} 
                />
              </div>

              {selectedPeriod?.period_id === period.period_id && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    TOTALS
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Calls</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          {period.totals.calls.toLocaleString()}
                        </span>
                        <GoalBadge met={period.goals_met.calls} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Reservations</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          {period.totals.reservations}
                        </span>
                        <GoalBadge met={period.goals_met.reservations} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Profit</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          ${period.totals.profit.toLocaleString()}
                        </span>
                        <GoalBadge met={period.goals_met.profit} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Spins</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          ${period.totals.spins.toLocaleString()}
                        </span>
                        <GoalBadge met={period.goals_met.spins} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Combined</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          ${period.totals.combined.toLocaleString()}
                        </span>
                        <GoalBadge met={period.goals_met.combined} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Conversion</div>
                      <div className="font-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        {period.conversion_rate}%
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f9f9f9', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <strong>Prepaid:</strong> {period.totals.prepaid_count} • 
                      <strong> Refund Protection:</strong> {period.totals.refund_protection_count} • 
                      <strong> Avg Time:</strong> {period.avg_time_per_booking} min
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default History;
