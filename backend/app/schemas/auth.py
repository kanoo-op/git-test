from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: str
    role: str = "doctor"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserBrief"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class UserBrief(BaseModel):
    id: str
    username: str
    full_name: str
    role: str

    model_config = {"from_attributes": True}


# Rebuild to resolve forward ref
TokenResponse.model_rebuild()
