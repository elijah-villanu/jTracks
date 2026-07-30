"""B14/B16 — dashboard stats and recap."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.dashboard import DashboardRecap, DashboardStats, RangeParam, RecapRangeParam
from app.services.dashboard_service import compute_stats
from app.services.recap_service import compute_recap

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(
    range: RangeParam = Query(default="all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStats:
    return compute_stats(db, current_user.id, range_=range)


@router.get("/recap", response_model=DashboardRecap)
def dashboard_recap(
    range: RecapRangeParam = Query(default="week"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardRecap:
    return compute_recap(db, current_user.id, range_=range)
