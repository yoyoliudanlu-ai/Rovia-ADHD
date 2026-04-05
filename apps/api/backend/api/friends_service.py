from __future__ import annotations

from copy import deepcopy

from .demo_accounts import SHOWCASE_DEMO_ACCOUNT

SHOWCASE_FRIENDS = [
    {
        "id": "friend-luna",
        "name": "Luna",
        "tags": ["study", "health"],
        "status": "connected",
        "minutes": 96,
        "rounds": 4,
        "streak": 3,
    },
    {
        "id": "friend-mika",
        "name": "Mika",
        "tags": ["work", "study"],
        "status": "connected",
        "minutes": 88,
        "rounds": 3,
        "streak": 4,
    },
    {
        "id": "friend-jo",
        "name": "Jo",
        "tags": ["health", "social"],
        "status": "recommended",
        "minutes": 74,
        "rounds": 3,
        "streak": 2,
    },
    {
        "id": "friend-rin",
        "name": "Rin",
        "tags": ["work", "home"],
        "status": "recommended",
        "minutes": 62,
        "rounds": 2,
        "streak": 5,
    },
]

_pending_requests: set[tuple[str, str]] = set()
_friendships: set[tuple[str, str]] = set()


def _with_runtime_status(entry: dict, *, user_id: str) -> dict:
    item = deepcopy(entry)
    pair = tuple(sorted((user_id, item["id"])))
    if pair in _friendships or item["status"] == "connected":
        item["status"] = "connected"
    elif (user_id, item["id"]) in _pending_requests:
        item["status"] = "pending"
    return item


def list_friends(user_id: str) -> list[dict]:
    return [
        _with_runtime_status(entry, user_id=user_id)
        for entry in SHOWCASE_FRIENDS
        if entry["status"] == "connected"
        or tuple(sorted((user_id, entry["id"]))) in _friendships
    ]


def get_recommendations(user_id: str) -> list[dict]:
    connected_ids = {item["id"] for item in list_friends(user_id)}
    results = []
    for entry in SHOWCASE_FRIENDS:
        if entry["id"] in connected_ids:
            continue
        item = _with_runtime_status(entry, user_id=user_id)
        item["score"] = len(item.get("tags") or [])
        results.append(item)
    return results


def get_ranking(user_id: str, day: str | None = None, limit: int = 20) -> list[dict]:
    del day
    ranking = [
        {
            "id": SHOWCASE_DEMO_ACCOUNT["user_id"],
            "name": SHOWCASE_DEMO_ACCOUNT["profile"]["display_name"],
            "minutes": 120,
            "rounds": 5,
            "streak": 6,
            "is_self": user_id == SHOWCASE_DEMO_ACCOUNT["user_id"],
        }
    ]
    ranking.extend(
        {
            "id": entry["id"],
            "name": entry["name"],
            "minutes": entry["minutes"],
            "rounds": entry["rounds"],
            "streak": entry["streak"],
            "is_self": entry["id"] == user_id,
        }
        for entry in SHOWCASE_FRIENDS
    )
    return ranking[: max(1, int(limit))]


def send_request(user_id: str, friend_id: str) -> dict:
    _pending_requests.add((user_id, friend_id))
    return {"ok": True, "status": "pending", "friend_id": friend_id}


def accept_request(user_id: str, friend_id: str) -> dict:
    _pending_requests.discard((friend_id, user_id))
    _friendships.add(tuple(sorted((user_id, friend_id))))
    return {"ok": True, "status": "connected", "friend_id": friend_id}
