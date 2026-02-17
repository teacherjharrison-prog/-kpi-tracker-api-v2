# Business Constants - Single Source of Truth
# All KPI thresholds, goals, and business rules live here
#
# =============================================================================
# ARCHITECTURE NOTES (READ BEFORE MODIFYING)
# =============================================================================
#
# 1. VERSIONING (Future)
#    When goals change, you'll want historical context:
#    "What was the target THEN, not just NOW"
#    Consider: goals_v1, goals_v2, or a goals_history collection
#    with effective_date ranges. Not urgent. Inevitable.
#
# 2. STATUS THRESHOLDS
#    "warning" vs "behind" thresholds are DATA, not logic.
#    If they ever become configurable per-user or per-period,
#    they already live here. Don't leak them elsewhere.
#
# 3. FRONTEND IS DUMB
#    The frontend trusts and renders. It does NOT calculate.
#    Resist "just one small calculation" - that's how regressions sneak in.
#    All derived values (progress_percent, on_track, status) come from here.
#
# =============================================================================

GOALS = {
    # Calls
    "calls_biweekly": 1710,
    "calls_weekly": 855,
    "calls_daily": 142,
    
    # Reservations
    "reservations_biweekly": 270,
    "reservations_weekly": 135,
    "reservations_daily": 22,
    
    # Profit
    "profit_biweekly": 865.00,
    "profit_weekly": 432.50,
    "profit_daily": 72.08,
    
    # Spins (bonuses)
    "spins_biweekly": 890.00,
    "spins_weekly": 445.00,
    "spins_daily": 74.17,
    
    # Combined target
    "combined_biweekly": 1800.00,
    
    # Misc income (lead gen + refund protection)
    "misc_biweekly": 35.00,
    
    # Spin averages
    "avg_spin": 5.00,
    "avg_mega_spin": 49.00,
    
    # Time
    "avg_time_per_booking": 30,
}

# Derived goals (calculated from base goals)
GOALS["conversion_rate_target"] = round((GOALS["reservations_biweekly"] / GOALS["calls_biweekly"]) * 100, 2)

# Spin business rules
SPIN_RULES = {
    "bookings_per_spin": 4,       # Spin earned every 4 bookings
    "spins_per_mega": 4,          # 4th spin is mega spin
}

# Progress thresholds for UI feedback
PROGRESS_THRESHOLDS = {
    "good": 100,      # >= 100% = on track (green)
    "warning": 75,    # >= 75% = getting there (yellow)
    "danger": 0,      # < 75% = behind (red)
}

# Status indicators
STATUS = {
    "on_track": "on_track",
    "warning": "warning", 
    "behind": "behind",
}

def get_status(progress_percent: float) -> str:
    """Determine status based on progress percentage"""
    if progress_percent >= PROGRESS_THRESHOLDS["good"]:
        return STATUS["on_track"]
    elif progress_percent >= PROGRESS_THRESHOLDS["warning"]:
        return STATUS["warning"]
    return STATUS["behind"]

def calculate_progress(current: float, goal: float) -> float:
    """Calculate progress percentage safely"""
    if goal <= 0:
        return 0.0
    return round((current / goal) * 100, 1)

def is_on_track(current: float, goal: float) -> bool:
    """Determine if metric is on track"""
    return current >= goal
