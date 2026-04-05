#ifndef NVS_KEYS_H
#define NVS_KEYS_H

// System/configuration keys stored in NVS namespace "zclaw".
#define NVS_KEY_BOOT_COUNT   "boot_count"
#define NVS_KEY_WIFI_SSID    "wifi_ssid"
#define NVS_KEY_WIFI_PASS    "wifi_pass"
#define NVS_KEY_LLM_BACKEND  "llm_backend"
#define NVS_KEY_API_KEY      "api_key"
#define NVS_KEY_LLM_MODEL    "llm_model"
#define NVS_KEY_LLM_API_URL  "llm_api_url"
#define NVS_KEY_TG_TOKEN     "tg_token"
#define NVS_KEY_TG_CHAT_ID   "tg_chat_id"
#define NVS_KEY_TG_CHAT_IDS  "tg_chat_ids"
#define NVS_KEY_TIMEZONE     "timezone"
#define NVS_KEY_PERSONA      "persona"
#define NVS_KEY_MQTT_URI     "mqtt_uri"     // e.g. mqtts://xxxx.emqxsl.cn:8883
#define NVS_KEY_MQTT_USER    "mqtt_user"
#define NVS_KEY_MQTT_PASS    "mqtt_pass"
#define NVS_KEY_MQTT_TOPIC   "mqtt_topic"   // topic prefix, default "zclaw"
#define NVS_KEY_SB_URL       "sb_url"
#define NVS_KEY_SB_KEY       "sb_key"
#define NVS_KEY_SB_TABLE     "sb_table"
#define NVS_KEY_SB_USER_FIELD "sb_userfld"
#define NVS_KEY_SB_USER_ID   "sb_userid"
#define NVS_KEY_SB_TEXT_FIELD "sb_txtfld"
#define NVS_KEY_SB_DONE_FIELD "sb_donefld"
#define NVS_KEY_SB_CTIME_FIELD "sb_ctimefld"

// Rate-limit bookkeeping keys.
#define NVS_KEY_RL_DAILY     "rl_daily"
#define NVS_KEY_RL_DAY       "rl_day"
#define NVS_KEY_RL_YEAR      "rl_year"

#endif // NVS_KEYS_H
