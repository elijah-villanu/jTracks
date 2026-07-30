"""Auth request/response schemas."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class GoogleOAuthRequest(BaseModel):
    # The Google-issued ID token (JWT) obtained by the frontend's Google button.
    id_token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: uuid.UUID
    email: EmailStr
    google_id: str | None = None
    ghost_days_default: int

    model_config = {"from_attributes": True}
