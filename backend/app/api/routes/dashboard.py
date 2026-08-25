"""B14/B16/B22/B23 — dashboard stats and recap.

Both endpoints take the identical range set (R6.1): `week | month | year | all |
custom`, with `start`/`end` required when `range=custom`. The cross-field custom
validation lives on `RangeQuery` so a bad span is a pydantic `422`, not a
hand-rolled `400` — see `app/schemas/dashboard.py`.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.dashboard import (
    DashboardRecap,
    DashboardStats,
    RangeQuery,
    RecapRangeQuery,
)
from app.services.dashboard_service import compute_stats
from app.services.recap_service import compute_recap

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(
    params: Annotated[RangeQuery, Query()],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStats:
    return compute_stats(
        db,
        current_user.id,
        range_=params.range,
        start=params.start,
        end=params.end,
    )


@router.get("/recap", response_model=DashboardRecap)
def dashboard_recap(
    params: Annotated[RecapRangeQuery, Query()],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardRecap:
    return compute_recap(
        db,
        current_user.id,
        range_=params.range,
        start=params.start,
        end=params.end,
    )
