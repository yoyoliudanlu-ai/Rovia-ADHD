import os


SHOWCASE_DEMO_ACCOUNT = {
    # Prefer the configured real UUID so demo mode can pass FK constraints
    # on tables such as todos / focus_sessions in Supabase.
    "user_id": os.getenv("ADHD_USER_ID", "7f3a2f8a-5f6b-4e93-8cc8-3f0b9e26d1a1"),
    "email": "showcase@rovia.local",
    "profile": {
        "display_name": "Rovia Showcase",
        "headline": "用于演示好友地图、排行榜和账号页的展示账号。",
        "tags": ["study", "work", "health"],
    },
}
