from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..auth_context import resolve_user_id
from ..friends_service import (
    accept_request,
    get_ranking,
    get_recommendations,
    list_friends as list_friends_for_user,
    send_request,
)

router = APIRouter(prefix="/api/friends", tags=["friends"])


class FriendActionRequest(BaseModel):
    friend_id: str


@router.get("/list")
def list_friends(request: Request = None):
    return {"data": list_friends_for_user(resolve_user_id(request, required=True))}


@router.get("/recommendations")
def recommend_friends(request: Request = None):
    return {"data": get_recommendations(resolve_user_id(request, required=True))}


@router.get("/ranking")
def get_friend_ranking(request: Request = None, day: str | None = None, limit: int = 20):
    return {
        "data": get_ranking(
            resolve_user_id(request, required=True),
            day=day,
            limit=limit,
        )
    }


@router.post("/request")
def request_friend(request: Request = None, body: FriendActionRequest | None = None):
    return send_request(
        resolve_user_id(request, required=True),
        getattr(body, "friend_id", ""),
    )


@router.post("/accept")
def accept_friend(request: Request = None, body: FriendActionRequest | None = None):
    return accept_request(
        resolve_user_id(request, required=True),
        getattr(body, "friend_id", ""),
    )
