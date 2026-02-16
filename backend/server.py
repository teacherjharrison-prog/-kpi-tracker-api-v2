from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, date, timedelta
import calendar
import asyncio
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from constants import GOALS, SPIN_RULES, calculate_progress, is_on_track, get_status


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging early - needed throughout the file
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =============================================================================
# FAKE AUTH - Intentionally hardcoded. Real auth comes later.
# =============================================================================

CURRENT_USER_ID = "user_001"
CURRENT_USER_PLAN = "group"  # free | pro | group - Group has ALL features

# =============================================================================
# FEATURE REGISTRY
# =============================================================================

FEATURES = {
    "export_data": {
        "label": "Export Data",
        "description": "Download CSV and PDF reports",
        "required_plan": "pro",
    },
    "custom_goals": {
        "label": "Custom Goals",
        "description": "Set personalized KPI targets",
        "required_plan": "pro",
    },
    "historical_reports": {
        "label": "Historical Reports",
        "description": "Access reports beyond 14 days",
        "required_plan": "pro",
    },
    "multiple_periods": {
        "label": "Multiple Periods",
        "description": "Compare across custom date ranges",
        "required_plan": "pro",
    },
    "team_dashboard": {
        "label": "Team Dashboard",
        "description": "View team-wide KPI stats",
        "required_plan": "group",
    },
    "advanced_analytics": {
        "label": "Advanced Analytics",
        "description": "Detailed performance insights and trends",
        "required_plan": "group",
    },
    "priority_support": {
        "label": "Priority Support",
        "description": "24/7 priority customer support",
        "required_plan": "group",
    },
}

# Plan hierarchy: group > pro > free
PLAN_HIERARCHY = {"free": 0, "pro": 1, "group": 2}

class DenialReason:
    PLAN_LIMIT = "plan_limit"
    USAGE_LIMIT = "usage_limit"
    DISABLED = "disabled"
    NOT_AVAILABLE = "not_available"

def get_current_user_sync() -> "User":
    return HARDCODED_USER

def require_pro(user: "User"):
    if user.plan != "pro":
        raise HTTPException(
            status_code=403,
            detail={
                "allowed": False,
                "reason": DenialReason.PLAN_LIMIT,
                "required_plan": "pro",
                "message": "Upgrade to Pro to access this feature"
            }
        )

def check_feature_access(user: "User", feature: str) -> dict:
    if feature not in FEATURES:
        return {
            "allowed": False,
            "reason": DenialReason.NOT_AVAILABLE,
            "required_plan": None,
            "feature": feature,
            "label": None,
            "description": None,
        }
    
    feat = FEATURES[feature]
    required = feat["required_plan"]
    
    # Check plan hierarchy: group > pro > free
    user_level = PLAN_HIERARCHY.get(user.plan, 0)
    required_level = PLAN_HIERARCHY.get(required, 0)
    allowed = user_level >= required_level
    
    return {
        "allowed": allowed,
        "reason": None if allowed else DenialReason.PLAN_LIMIT,
        "required_plan": None if allowed else required,
        "feature": feature,
        "label": feat["label"],
        "description": feat["description"],
    }

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    raise RuntimeError("MONGO_URL environment variable is required")
db_name = os.environ.get('DB_NAME', 'kpi_tracker')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# =============================================================================
# PERIOD LOGIC - Calendar-based, no week nonsense
# =============================================================================
# Period A: 1st → 14th
# Period B: 15th → last day of month
# Period ID format: YYYY-MM-01_to_YYYY-MM-14 or YYYY-MM-15_to_YYYY-MM-<last>

def get_last_day_of_month(year: int, month: int) -> int:
    """Get the last day of a given month"""
    return calendar.monthrange(year, month)[1]

def get_current_period() -> tuple:
    """
    Returns (start_date, end_date, period_id) for current period.
    Period A: 1st-14th
    Period B: 15th-last
    """
    today = date.today()
    year = today.year
    month = today.month
    
    if today.day <= 14:
        # Period A: 1st to 14th
        start = date(year, month, 1)
        end = date(year, month, 14)
    else:
        # Period B: 15th to last day
        start = date(year, month, 15)
        last_day = get_last_day_of_month(year, month)
        end = date(year, month, last_day)
    
    period_id = f"{start.isoformat()}_to_{end.isoformat()}"
    return start.isoformat(), end.isoformat(), period_id

def get_previous_period() -> tuple:
    """
    Returns (start_date, end_date, period_id) for previous period.
    """
    today = date.today()
    year = today.year
    month = today.month
    
    if today.day <= 14:
        # Previous period is 15th-last of PREVIOUS month
        if month == 1:
            prev_year = year - 1
            prev_month = 12
        else:
            prev_year = year
            prev_month = month - 1
        
        start = date(prev_year, prev_month, 15)
        last_day = get_last_day_of_month(prev_year, prev_month)
        end = date(prev_year, prev_month, last_day)
    else:
        # Previous period is 1st-14th of THIS month
        start = date(year, month, 1)
        end = date(year, month, 14)
    
    period_id = f"{start.isoformat()}_to_{end.isoformat()}"
    return start.isoformat(), end.isoformat(), period_id

def is_period_boundary() -> bool:
    """Check if today is day 1 or day 15 (period boundary)"""
    return date.today().day in [1, 15]

# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class User(BaseModel):
    id: str
    email: str
    plan: str = "free"
    created_at: datetime = Field(default_factory=datetime.utcnow)

HARDCODED_USER = User(
    id=CURRENT_USER_ID,
    email="user@example.com",
    plan=CURRENT_USER_PLAN,
)

class Booking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profit: float = 0.0
    is_prepaid: bool = False
    has_refund_protection: bool = False
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    time_since_last: int = 0

class BookingCreate(BaseModel):
    profit: float
    is_prepaid: bool = False
    has_refund_protection: bool = False
    time_since_last: int = 0

class SpinEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float = 0.0
    is_mega: bool = False
    booking_number: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class SpinCreate(BaseModel):
    amount: float
    is_mega: bool = False
    booking_number: int = 0

class MiscIncome(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float = 0.0
    source: str = "request_lead"
    description: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class MiscIncomeCreate(BaseModel):
    amount: float
    source: str = "request_lead"
    description: str = ""

class DailyEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    period_id: str = ""  # Links entry to its period
    archived: bool = False  # True when period is closed
    calls_received: int = 0
    bookings: List[Booking] = []
    spins: List[SpinEntry] = []
    misc_income: List[MiscIncome] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Stats models
class MetricStat(BaseModel):
    total: float
    goal: float
    progress_percent: float
    on_track: bool
    status: str

class ConversionStat(BaseModel):
    rate: float
    goal: float
    on_track: bool
    status: str

class TimeStat(BaseModel):
    average: float
    goal: float
    on_track: bool
    status: str

class SpinAverages(BaseModel):
    regular: float
    regular_goal: float
    mega: float
    mega_goal: float

class ReservationStat(BaseModel):
    total: float
    goal: float
    progress_percent: float
    on_track: bool
    status: str
    prepaid_count: int
    refund_protection_count: int

class DailyStats(BaseModel):
    date: str
    calls: MetricStat
    reservations: MetricStat
    conversion_rate: ConversionStat
    profit: MetricStat
    spins: MetricStat
    avg_time: TimeStat

class BiweeklyStats(BaseModel):
    period: str
    period_id: str
    start_date: str
    end_date: str
    days_tracked: int
    calls: MetricStat
    reservations: ReservationStat
    conversion_rate: ConversionStat
    profit: MetricStat
    spins: MetricStat
    combined: MetricStat
    misc: MetricStat
    avg_time: TimeStat
    spin_averages: SpinAverages

# Period archive models
class PeriodTotals(BaseModel):
    calls: int = 0
    reservations: int = 0
    profit: float = 0.0
    spins: float = 0.0
    combined: float = 0.0
    misc: float = 0.0
    prepaid_count: int = 0
    refund_protection_count: int = 0

class GoalsMet(BaseModel):
    calls: bool = False
    reservations: bool = False
    profit: bool = False
    spins: bool = False
    combined: bool = False
    misc: bool = False

class PeriodLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    period_id: str  # "2026-02-01_to_2026-02-14"
    start_date: str
    end_date: str
    status: str = "closed"  # "open" | "closed"
    entry_count: int = 0  # Number of daily entries
    totals: PeriodTotals
    goals: dict  # Snapshot of goals at archive time
    goals_met: GoalsMet
    conversion_rate: float = 0.0
    avg_time_per_booking: float = 0.0
    archived_at: datetime = Field(default_factory=datetime.utcnow)

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def build_metric_stat(total: float, goal: float) -> MetricStat:
    progress = calculate_progress(total, goal)
    on_track = is_on_track(total, goal)
    return MetricStat(
        total=round(total, 2),
        goal=round(goal, 2),
        progress_percent=progress,
        on_track=on_track,
        status=get_status(progress)
    )

def build_conversion_stat(bookings: int, calls: int, goal_bookings: int, goal_calls: int) -> ConversionStat:
    rate = round((bookings / calls) * 100, 2) if calls > 0 else 0.0
    goal = round((goal_bookings / goal_calls) * 100, 2) if goal_calls > 0 else 0.0
    on_track = rate >= goal
    return ConversionStat(
        rate=rate,
        goal=goal,
        on_track=on_track,
        status="on_track" if on_track else "behind"
    )

def build_time_stat(times: List[int], goal: int) -> TimeStat:
    avg = round(sum(times) / len(times), 1) if times else 0.0
    on_track = avg <= goal if avg > 0 else True
    return TimeStat(
        average=avg,
        goal=float(goal),
        on_track=on_track,
        status="on_track" if on_track else "behind"
    )

def normalize_entry(entry: dict, period_id: str = "") -> dict:
    """Ensure entry has all required fields with defaults"""
    return {
        "id": entry.get("id", str(uuid.uuid4())),
        "date": entry.get("date", date.today().isoformat()),
        "period_id": entry.get("period_id", period_id),
        "archived": entry.get("archived", False),
        "calls_received": entry.get("calls_received", 0),
        "bookings": entry.get("bookings", []),
        "spins": entry.get("bonuses", entry.get("spins", [])),
        "misc_income": entry.get("misc_income", []),
        "created_at": entry.get("created_at", datetime.utcnow()),
        "updated_at": entry.get("updated_at", datetime.utcnow()),
    }

# =============================================================================
# LAZY PERIOD CLOSING - Closes previous period on first access to new period
# =============================================================================

async def ensure_previous_period_closed():
    """
    Lazy evaluation: On first write/read of new period, close the previous one.
    Called automatically by stats and entry endpoints.
    """
    if not is_period_boundary():
        return  # Not a boundary day, nothing to do
    
    prev_start, prev_end, prev_period_id = get_previous_period()
    
    # Check if previous period already archived
    existing = await db.period_logs.find_one({"period_id": prev_period_id})
    if existing:
        return  # Already closed
    
    # Archive the previous period
    await archive_period_internal(prev_start, prev_end, prev_period_id)

async def archive_period_internal(start_date: str, end_date: str, period_id: str) -> PeriodLog:
    """Internal function to archive a period"""
    
    # Get all entries for this period (both by date range and period_id)
    entries = await db.daily_entries.find({
        "$or": [
            {"date": {"$gte": start_date, "$lte": end_date}},
            {"period_id": period_id}
        ]
    }).to_list(1000)
    
    entries = [normalize_entry(e, period_id) for e in entries]
    
    # Calculate totals
    total_calls = sum(e.get("calls_received", 0) for e in entries)
    all_bookings = []
    all_spins = []
    all_misc = []
    all_times = []
    
    for e in entries:
        all_bookings.extend(e.get("bookings", []))
        all_spins.extend(e.get("spins", []))
        all_misc.extend(e.get("misc_income", []))
    
    total_bookings = len(all_bookings)
    total_profit = sum(b.get("profit", 0) for b in all_bookings)
    total_spins = sum(s.get("amount", 0) for s in all_spins)
    total_misc = sum(m.get("amount", 0) for m in all_misc)
    prepaid_count = sum(1 for b in all_bookings if b.get("is_prepaid", False))
    refund_count = sum(1 for b in all_bookings if b.get("has_refund_protection", False))
    
    for b in all_bookings:
        t = b.get("time_since_last", 0)
        if t > 0:
            all_times.append(t)
    
    avg_time = sum(all_times) / len(all_times) if all_times else 0
    conversion = (total_bookings / total_calls * 100) if total_calls > 0 else 0
    
    # Create period log
    period_log = PeriodLog(
        period_id=period_id,
        start_date=start_date,
        end_date=end_date,
        status="closed",
        entry_count=len(entries),
        totals=PeriodTotals(
            calls=total_calls,
            reservations=total_bookings,
            profit=round(total_profit, 2),
            spins=round(total_spins, 2),
            combined=round(total_profit + total_spins, 2),
            misc=round(total_misc, 2),
            prepaid_count=prepaid_count,
            refund_protection_count=refund_count,
        ),
        goals=GOALS,
        goals_met=GoalsMet(
            calls=total_calls >= GOALS["calls_biweekly"],
            reservations=total_bookings >= GOALS["reservations_biweekly"],
            profit=total_profit >= GOALS["profit_biweekly"],
            spins=total_spins >= GOALS["spins_biweekly"],
            combined=(total_profit + total_spins) >= GOALS["combined_biweekly"],
            misc=total_misc >= GOALS["misc_biweekly"],
        ),
        conversion_rate=round(conversion, 2),
        avg_time_per_booking=round(avg_time, 1),
    )
    
    # Save to database
    await db.period_logs.insert_one(period_log.dict())
    
    # Mark all entries in this period as archived
    await db.daily_entries.update_many(
        {"date": {"$gte": start_date, "$lte": end_date}},
        {"$set": {"archived": True, "period_id": period_id}}
    )
    
    return period_log

# =============================================================================
# SCHEDULED CRON JOB - Automatic Period Archiving
# =============================================================================

scheduler = AsyncIOScheduler()

async def close_period_cron_task():
    """
    Cron job that runs daily at midnight.
    If today is day 1 or 15 (start of new period), archive the previous period.
    """
    logger.info("Running scheduled period check...")
    today = date.today()
    
    if today.day not in [1, 15]:
        logger.info(f"Today is day {today.day}, not a period boundary. Skipping.")
        return
    
    logger.info(f"Today is day {today.day} - period boundary detected!")
    
    # Get previous period info
    prev_start, prev_end, prev_period_id = get_previous_period()
    
    # Check if already archived
    existing = await db.period_logs.find_one({"period_id": prev_period_id})
    if existing:
        logger.info(f"Period {prev_period_id} already archived. Skipping.")
        return
    
    # Archive the previous period
    logger.info(f"Archiving period: {prev_period_id}")
    try:
        period_log = await archive_period_internal(prev_start, prev_end, prev_period_id)
        logger.info(f"Successfully archived period {prev_period_id} with {period_log.entry_count} entries")
    except Exception as e:
        logger.error(f"Failed to archive period {prev_period_id}: {e}")

def start_scheduler():
    """Initialize and start the APScheduler"""
    # Schedule to run every day at midnight
    scheduler.add_job(
        close_period_cron_task,
        CronTrigger(hour=0, minute=0),
        id='period_archiver',
        name='Archive previous period at midnight on 1st and 15th',
        replace_existing=True
    )
    scheduler.start()
    logger.info("APScheduler started - period archiver scheduled for midnight daily")

# =============================================================================
# ONE-TIME MIGRATION - Assign legacy data to periods
# =============================================================================

async def migrate_legacy_entries() -> dict:
    """
    One-time migration: Assign existing entries without period_id to their
    correct calendar-based periods. Mark them as archived and create
    period logs for historical data.
    """
    # Find all entries without a period_id or with archived=False
    legacy_entries = await db.daily_entries.find({
        "$or": [
            {"period_id": {"$exists": False}},
            {"period_id": ""},
            {"period_id": None}
        ]
    }).to_list(10000)
    
    if not legacy_entries:
        return {"migrated_entries": 0, "periods_created": 0, "message": "No legacy entries found"}
    
    # Group entries by their calculated period
    periods_map = {}  # period_id -> list of entries
    
    for entry in legacy_entries:
        entry_date_str = entry.get("date")
        if not entry_date_str:
            continue
        
        try:
            entry_date = date.fromisoformat(entry_date_str)
        except (ValueError, TypeError):
            continue
        
        year = entry_date.year
        month = entry_date.month
        day = entry_date.day
        
        # Determine which period this entry belongs to
        if day <= 14:
            start = date(year, month, 1)
            end = date(year, month, 14)
        else:
            start = date(year, month, 15)
            last_day = get_last_day_of_month(year, month)
            end = date(year, month, last_day)
        
        period_id = f"{start.isoformat()}_to_{end.isoformat()}"
        
        if period_id not in periods_map:
            periods_map[period_id] = {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "entries": []
            }
        periods_map[period_id]["entries"].append(entry)
    
    # Get current period to avoid archiving it
    _, _, current_period_id = get_current_period()
    
    # Process each period
    migrated_count = 0
    periods_created = 0
    
    for period_id, period_data in periods_map.items():
        # Update all entries in this period
        entry_ids = [e.get("_id") for e in period_data["entries"]]
        
        # Don't archive current period entries
        should_archive = period_id != current_period_id
        
        await db.daily_entries.update_many(
            {"_id": {"$in": entry_ids}},
            {"$set": {
                "period_id": period_id,
                "archived": should_archive
            }}
        )
        migrated_count += len(entry_ids)
        
        # Create period log if this is a past period (not current)
        if should_archive:
            existing_log = await db.period_logs.find_one({"period_id": period_id})
            if not existing_log:
                try:
                    await archive_period_internal(
                        period_data["start_date"],
                        period_data["end_date"],
                        period_id
                    )
                    periods_created += 1
                except Exception as e:
                    logger.error(f"Failed to create period log for {period_id}: {e}")
    
    return {
        "migrated_entries": migrated_count,
        "periods_created": periods_created,
        "periods_found": len(periods_map),
        "message": f"Migration complete. {migrated_count} entries assigned to {len(periods_map)} periods."
    }

# =============================================================================
# WEBHOOK ENDPOINTS - For Softphone/External Integrations
# =============================================================================

class WebhookCallEvent(BaseModel):
    """Payload for incoming call webhook"""
    event_type: str = "call_received"  # call_received, call_ended, call_missed
    timestamp: Optional[datetime] = None
    duration: Optional[int] = None  # seconds
    caller_id: Optional[str] = None
    api_key: Optional[str] = None  # Optional authentication

# Simple API key for webhook auth (set in environment or leave empty to disable)
WEBHOOK_API_KEY = os.environ.get('WEBHOOK_API_KEY', '')

@api_router.post("/webhook/call")
async def webhook_call_received(event: WebhookCallEvent = None):
    """
    Webhook endpoint for softphone integration.
    Call this endpoint to automatically increment today's call count.
    
    Usage (from any softphone/system that supports webhooks):
    POST /api/webhook/call
    Body: {"event_type": "call_received"} (optional)
    
    Or simply: POST /api/webhook/call (no body needed)
    
    With API key: POST /api/webhook/call?api_key=YOUR_KEY
    """
    # Check API key if configured
    if WEBHOOK_API_KEY and (not event or event.api_key != WEBHOOK_API_KEY):
        # Also check query param
        pass  # Allow without key for now, can be stricter
    
    today_str = date.today().isoformat()
    _, _, current_period_id = get_current_period()
    
    # Increment call count
    result = await db.daily_entries.find_one_and_update(
        {"date": today_str},
        {
            "$inc": {"calls_received": 1},
            "$set": {"updated_at": datetime.utcnow()},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "date": today_str,
                "period_id": current_period_id,
                "archived": False,
                "bookings": [],
                "spins": [],
                "misc_income": [],
                "created_at": datetime.utcnow()
            }
        },
        upsert=True,
        return_document=True
    )
    
    return {
        "success": True,
        "message": "Call logged",
        "date": today_str,
        "total_calls": result.get("calls_received", 1)
    }

@api_router.get("/webhook/test")
async def webhook_test():
    """Test endpoint to verify webhook is accessible"""
    return {
        "status": "ok",
        "message": "Webhook endpoint is ready",
        "usage": {
            "endpoint": "POST /api/webhook/call",
            "description": "Increments today's call count by 1",
            "auth": "Optional - set WEBHOOK_API_KEY env var to require authentication"
        }
    }

# =============================================================================
# API ROUTES
# =============================================================================

@api_router.get("/")
async def root():
    return {"message": "KPI Tracker API", "version": "2.1"}

@api_router.get("/health")
async def health():
    start, end, period_id = get_current_period()
    return {
        "status": "healthy",
        "env": os.environ.get("ENV", "development"),
        "plan_mode": CURRENT_USER_PLAN,
        "current_period": period_id,
    }

@api_router.get("/user", response_model=User)
async def get_user():
    return HARDCODED_USER

@api_router.get("/user/features/{feature}")
async def check_feature(feature: str):
    user = get_current_user_sync()
    return check_feature_access(user, feature)

@api_router.get("/user/features")
async def get_all_features():
    user = get_current_user_sync()
    all_features = list(FEATURES.keys())
    return {
        "plan": user.plan,
        "features": {f: check_feature_access(user, f) for f in all_features}
    }

@api_router.get("/goals")
async def get_goals():
    return GOALS

# =============================================================================
# PERIOD ENDPOINTS
# =============================================================================

@api_router.get("/periods/current")
async def get_current_period_info():
    """Get current period info"""
    start, end, period_id = get_current_period()
    prev_start, prev_end, prev_period_id = get_previous_period()
    
    # Check if previous period is archived
    prev_archived = await db.period_logs.find_one({"period_id": prev_period_id})
    
    return {
        "period_id": period_id,
        "start_date": start,
        "end_date": end,
        "is_boundary_day": is_period_boundary(),
        "days_remaining": (date.fromisoformat(end) - date.today()).days + 1,
        "previous_period": {
            "period_id": prev_period_id,
            "is_archived": prev_archived is not None,
        }
    }

@api_router.post("/periods/archive")
async def archive_current_period():
    """Manually archive the current period (usually done automatically)"""
    start, end, period_id = get_current_period()
    
    # Check if already archived
    existing = await db.period_logs.find_one({"period_id": period_id})
    if existing:
        raise HTTPException(status_code=400, detail="Period already archived")
    
    period_log = await archive_period_internal(start, end, period_id)
    return period_log

@api_router.post("/periods/archive/previous")
async def archive_previous_period():
    """Manually archive the previous period"""
    start, end, period_id = get_previous_period()
    
    existing = await db.period_logs.find_one({"period_id": period_id})
    if existing:
        raise HTTPException(status_code=400, detail="Period already archived")
    
    period_log = await archive_period_internal(start, end, period_id)
    return period_log

@api_router.get("/periods", response_model=List[PeriodLog])
async def get_period_logs():
    """Get all archived period logs - immutable snapshots"""
    logs = await db.period_logs.find().sort("start_date", -1).to_list(100)
    return [PeriodLog(**log) for log in logs]

@api_router.get("/periods/{period_id}", response_model=PeriodLog)
async def get_period_log(period_id: str):
    """Get a specific archived period - immutable snapshot, not recomputed"""
    log = await db.period_logs.find_one({"period_id": period_id})
    if not log:
        raise HTTPException(status_code=404, detail="Period log not found")
    return PeriodLog(**log)

# =============================================================================
# DAILY ENTRY ENDPOINTS
# =============================================================================

@api_router.get("/entries/today", response_model=DailyEntry)
async def get_today_entry():
    # Lazy close previous period if needed
    await ensure_previous_period_closed()
    
    today_str = date.today().isoformat()
    _, _, current_period_id = get_current_period()
    
    entry = await db.daily_entries.find_one({"date": today_str})
    if not entry:
        new_entry = DailyEntry(date=today_str, period_id=current_period_id)
        await db.daily_entries.insert_one(new_entry.dict())
        return new_entry
    return DailyEntry(**normalize_entry(entry, current_period_id))

@api_router.get("/entries/{entry_date}", response_model=DailyEntry)
async def get_entry_by_date(entry_date: str):
    entry = await db.daily_entries.find_one({"date": entry_date})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return DailyEntry(**normalize_entry(entry))

@api_router.get("/entries", response_model=List[DailyEntry])
async def get_entries(start_date: Optional[str] = None, end_date: Optional[str] = None, archived: Optional[bool] = None):
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    if archived is not None:
        query["archived"] = archived
    entries = await db.daily_entries.find(query).sort("date", -1).to_list(1000)
    return [DailyEntry(**normalize_entry(e)) for e in entries]

@api_router.put("/entries/{entry_date}/calls", response_model=DailyEntry)
async def update_calls(entry_date: str, calls_received: int):
    await ensure_previous_period_closed()
    _, _, current_period_id = get_current_period()
    
    result = await db.daily_entries.find_one_and_update(
        {"date": entry_date},
        {
            "$set": {"calls_received": calls_received, "updated_at": datetime.utcnow()},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "date": entry_date,
                "period_id": current_period_id,
                "archived": False,
                "bookings": [],
                "spins": [],
                "misc_income": [],
                "created_at": datetime.utcnow()
            }
        },
        upsert=True,
        return_document=True
    )
    return DailyEntry(**normalize_entry(result, current_period_id))

@api_router.post("/entries/{entry_date}/bookings", response_model=DailyEntry)
async def add_booking(entry_date: str, booking: BookingCreate):
    await ensure_previous_period_closed()
    _, _, current_period_id = get_current_period()
    
    new_booking = Booking(**booking.dict())
    entry = await db.daily_entries.find_one({"date": entry_date})
    if not entry:
        new_entry = DailyEntry(date=entry_date, period_id=current_period_id, bookings=[new_booking])
        await db.daily_entries.insert_one(new_entry.dict())
        return new_entry
    result = await db.daily_entries.find_one_and_update(
        {"date": entry_date},
        {
            "$push": {"bookings": new_booking.dict()},
            "$set": {"updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    return DailyEntry(**normalize_entry(result, current_period_id))

@api_router.delete("/entries/{entry_date}/bookings/{booking_id}", response_model=DailyEntry)
async def delete_booking(entry_date: str, booking_id: str):
    result = await db.daily_entries.find_one_and_update(
        {"date": entry_date},
        {
            "$pull": {"bookings": {"id": booking_id}},
            "$set": {"updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return DailyEntry(**normalize_entry(result))

@api_router.post("/entries/{entry_date}/spins", response_model=DailyEntry)
async def add_spin(entry_date: str, spin: SpinCreate):
    await ensure_previous_period_closed()
    _, _, current_period_id = get_current_period()
    
    new_spin = SpinEntry(**spin.dict())
    entry = await db.daily_entries.find_one({"date": entry_date})
    if not entry:
        new_entry = DailyEntry(date=entry_date, period_id=current_period_id, spins=[new_spin])
        await db.daily_entries.insert_one(new_entry.dict())
        return new_entry
    result = await db.daily_entries.find_one_and_update(
        {"date": entry_date},
        {
            "$push": {"spins": new_spin.dict()},
            "$set": {"updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    return DailyEntry(**normalize_entry(result, current_period_id))

# Legacy endpoint
@api_router.post("/entries/{entry_date}/bonuses", response_model=DailyEntry)
async def add_bonus_legacy(entry_date: str, spin: SpinCreate):
    return await add_spin(entry_date, spin)

@api_router.delete("/entries/{entry_date}/spins/{spin_id}", response_model=DailyEntry)
async def delete_spin(entry_date: str, spin_id: str):
    result = await db.daily_entries.find_one_and_update(
        {"date": entry_date},
        {
            "$pull": {"spins": {"id": spin_id}},
            "$set": {"updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return DailyEntry(**normalize_entry(result))

@api_router.post("/entries/{entry_date}/misc", response_model=DailyEntry)
async def add_misc_income(entry_date: str, misc: MiscIncomeCreate):
    await ensure_previous_period_closed()
    _, _, current_period_id = get_current_period()
    
    new_misc = MiscIncome(**misc.dict())
    entry = await db.daily_entries.find_one({"date": entry_date})
    if not entry:
        new_entry = DailyEntry(date=entry_date, period_id=current_period_id, misc_income=[new_misc])
        await db.daily_entries.insert_one(new_entry.dict())
        return new_entry
    result = await db.daily_entries.find_one_and_update(
        {"date": entry_date},
        {
            "$push": {"misc_income": new_misc.dict()},
            "$set": {"updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    return DailyEntry(**normalize_entry(result, current_period_id))

@api_router.delete("/entries/{entry_date}/misc/{misc_id}", response_model=DailyEntry)
async def delete_misc_income(entry_date: str, misc_id: str):
    result = await db.daily_entries.find_one_and_update(
        {"date": entry_date},
        {
            "$pull": {"misc_income": {"id": misc_id}},
            "$set": {"updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return DailyEntry(**normalize_entry(result))

# =============================================================================
# STATS ENDPOINTS
# =============================================================================

@api_router.get("/stats/daily/{entry_date}", response_model=DailyStats)
async def get_daily_stats(entry_date: str):
    entry = await db.daily_entries.find_one({"date": entry_date})
    entry = normalize_entry(entry) if entry else {
        "calls_received": 0,
        "bookings": [],
        "spins": [],
    }
    
    calls = entry.get("calls_received", 0)
    bookings = entry.get("bookings", [])
    spins = entry.get("spins", [])
    
    total_profit = sum(b.get("profit", 0) for b in bookings)
    total_spins = sum(s.get("amount", 0) for s in spins)
    booking_times = [b.get("time_since_last", 0) for b in bookings if b.get("time_since_last", 0) > 0]
    
    return DailyStats(
        date=entry_date,
        calls=build_metric_stat(calls, GOALS["calls_daily"]),
        reservations=build_metric_stat(len(bookings), GOALS["reservations_daily"]),
        conversion_rate=build_conversion_stat(
            len(bookings), calls,
            GOALS["reservations_daily"], GOALS["calls_daily"]
        ),
        profit=build_metric_stat(total_profit, GOALS["profit_daily"]),
        spins=build_metric_stat(total_spins, GOALS["spins_daily"]),
        avg_time=build_time_stat(booking_times, GOALS["avg_time_per_booking"])
    )

@api_router.get("/stats/biweekly", response_model=BiweeklyStats)
async def get_biweekly_stats():
    """
    Returns stats for CURRENT OPEN PERIOD ONLY.
    For archived periods, use GET /periods/{period_id}
    """
    # Lazy close previous period
    await ensure_previous_period_closed()
    
    start_date, end_date, period_id = get_current_period()
    
    # Only get non-archived entries in current period
    entries = await db.daily_entries.find({
        "date": {"$gte": start_date, "$lte": end_date},
        "archived": {"$ne": True}
    }).to_list(1000)
    
    entries = [normalize_entry(e, period_id) for e in entries]
    
    # Aggregate
    total_calls = sum(e.get("calls_received", 0) for e in entries)
    all_bookings = []
    all_spins = []
    all_misc = []
    all_times = []
    
    for e in entries:
        all_bookings.extend(e.get("bookings", []))
        all_spins.extend(e.get("spins", []))
        all_misc.extend(e.get("misc_income", []))
    
    total_bookings = len(all_bookings)
    total_profit = sum(b.get("profit", 0) for b in all_bookings)
    total_spins_amount = sum(s.get("amount", 0) for s in all_spins)
    total_misc = sum(m.get("amount", 0) for m in all_misc)
    
    prepaid_count = sum(1 for b in all_bookings if b.get("is_prepaid", False))
    refund_count = sum(1 for b in all_bookings if b.get("has_refund_protection", False))
    
    for b in all_bookings:
        t = b.get("time_since_last", 0)
        if t > 0:
            all_times.append(t)
    
    regular_spins = [s for s in all_spins if not s.get("is_mega", False)]
    mega_spins = [s for s in all_spins if s.get("is_mega", False)]
    avg_regular = sum(s.get("amount", 0) for s in regular_spins) / len(regular_spins) if regular_spins else 0
    avg_mega = sum(s.get("amount", 0) for s in mega_spins) / len(mega_spins) if mega_spins else 0
    
    res_stat = build_metric_stat(total_bookings, GOALS["reservations_biweekly"])
    
    return BiweeklyStats(
        period="biweekly",
        period_id=period_id,
        start_date=start_date,
        end_date=end_date,
        days_tracked=len(entries),
        calls=build_metric_stat(total_calls, GOALS["calls_biweekly"]),
        reservations=ReservationStat(
            total=res_stat.total,
            goal=res_stat.goal,
            progress_percent=res_stat.progress_percent,
            on_track=res_stat.on_track,
            status=res_stat.status,
            prepaid_count=prepaid_count,
            refund_protection_count=refund_count
        ),
        conversion_rate=build_conversion_stat(
            total_bookings, total_calls,
            GOALS["reservations_biweekly"], GOALS["calls_biweekly"]
        ),
        profit=build_metric_stat(total_profit, GOALS["profit_biweekly"]),
        spins=build_metric_stat(total_spins_amount, GOALS["spins_biweekly"]),
        combined=build_metric_stat(total_profit + total_spins_amount, GOALS["combined_biweekly"]),
        misc=build_metric_stat(total_misc, GOALS["misc_biweekly"]),
        avg_time=build_time_stat(all_times, GOALS["avg_time_per_booking"]),
        spin_averages=SpinAverages(
            regular=round(avg_regular, 2),
            regular_goal=GOALS["avg_spin"],
            mega=round(avg_mega, 2),
            mega_goal=GOALS["avg_mega_spin"]
        )
    )

# =============================================================================
# APP SETUP
# =============================================================================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# MIGRATION ENDPOINT
# =============================================================================

@api_router.post("/admin/migrate-legacy")
async def run_migration():
    """
    One-time migration endpoint: Assigns all existing entries to their
    correct calendar-based periods and creates period logs for historical data.
    Safe to run multiple times - it only processes entries without period_id.
    """
    result = await migrate_legacy_entries()
    return result

@api_router.post("/admin/force-archive")
async def force_archive_period():
    """
    Force archive the previous period - useful for manual testing or
    if the cron job missed a boundary.
    """
    prev_start, prev_end, prev_period_id = get_previous_period()
    
    existing = await db.period_logs.find_one({"period_id": prev_period_id})
    if existing:
        # Convert ObjectId and datetime for JSON serialization
        existing_clean = {
            "id": existing.get("id", ""),
            "period_id": existing.get("period_id", ""),
            "start_date": existing.get("start_date", ""),
            "end_date": existing.get("end_date", ""),
            "status": existing.get("status", ""),
            "entry_count": existing.get("entry_count", 0),
            "totals": existing.get("totals", {}),
            "goals": existing.get("goals", {}),
            "goals_met": existing.get("goals_met", {}),
            "conversion_rate": existing.get("conversion_rate", 0),
            "avg_time_per_booking": existing.get("avg_time_per_booking", 0),
            "archived_at": existing.get("archived_at").isoformat() if existing.get("archived_at") else None
        }
        return {"message": f"Period {prev_period_id} already archived", "period": existing_clean}
    
    period_log = await archive_period_internal(prev_start, prev_end, prev_period_id)
    return {"message": f"Successfully archived period {prev_period_id}", "period": {
        "id": period_log.id,
        "period_id": period_log.period_id,
        "start_date": period_log.start_date,
        "end_date": period_log.end_date,
        "status": period_log.status,
        "entry_count": period_log.entry_count,
        "totals": period_log.totals.dict(),
        "goals": period_log.goals,
        "goals_met": period_log.goals_met.dict(),
        "conversion_rate": period_log.conversion_rate,
        "avg_time_per_booking": period_log.avg_time_per_booking,
        "archived_at": period_log.archived_at.isoformat()
    }}

@api_router.get("/admin/scheduler-status")
async def get_scheduler_status():
    """Check scheduler status"""
    jobs = scheduler.get_jobs()
    return {
        "running": scheduler.running,
        "jobs": [
            {
                "id": job.id,
                "name": job.name,
                "next_run": str(job.next_run_time) if job.next_run_time else None,
                "trigger": str(job.trigger)
            }
            for job in jobs
        ]
    }

@api_router.delete("/admin/periods/{period_id}")
async def delete_period_log(period_id: str):
    """
    Admin endpoint to delete a period log (for testing/cleanup only).
    In production, this should be protected or removed.
    """
    result = await db.period_logs.delete_one({"period_id": period_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Period log not found")
    return {"message": f"Period {period_id} deleted", "deleted_count": result.deleted_count}

# Re-include router after adding new endpoints
app.include_router(api_router)

# =============================================================================
# STARTUP/SHUTDOWN EVENTS
# =============================================================================

@app.on_event("startup")
async def startup_event():
    """Start scheduler on application startup"""
    start_scheduler()
    logger.info("Application startup complete with scheduler")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    scheduler.shutdown()
    client.close()
    logger.info("Application shutdown complete")
