window.SHEX_CLOUDBASE_CONFIG = {
  "officialStageThemes": {"enabled": true, "audience": "admin"},
  "envId": "dushe1344-d0gkkazhi84de696a",
  "region": "ap-shanghai",
  "authDiagnostics": true,
  "sdkUrl": "https://static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js",
  "characterAIStreamUrl": "https://shex.dushe.site/api/character-ai-stream",
  "characterAIServerEnabled": true,
  "characterAIServerUrl": "https://ai.shex.dushe.site/v1/character-ai/execute",
  "functions": {
    "auth": "shexAuth",
    "chatSync": "shexChatSyncTest",
    "calendar": "shexCalendar",
    "beautify": "shexBeautify",
    "xLetters": "shexXLetters"
  },
  "collections": {
    "users": "shex_users",
    "userData": "shex_user_data",
    "students": "shex_students",
    "calendar": "shex_calendar_records"
  },
  "chatIndexedDb": {
    "mode": "allowlist",
    "percent": 0,
    "allowlist": [
      "shex_fee7aa44-4790-47fc-a89c-fb6f886a6714"
    ],
    "recentPerConversation": 300,
    "legacyBackupDays": 14
  },
  "beautifyB1Gray": {
    "masterEnabled": true,
    "allowAdminDeviceOptIn": true,
    "adminAllowlist": [
      "shex_fee7aa44-4790-47fc-a89c-fb6f886a6714"
    ],
    "deviceOptInStorageKey": "shex_beautify_b1_admin_gray_enabled_v1",
    "quarantineStorageKey": "shex_beautify_b1_admin_gray_quarantine_v1"
  },
  "beautifyB5Gray": {
    "masterEnabled": true,
    "adminAllowlist": [
      "shex_fee7aa44-4790-47fc-a89c-fb6f886a6714"
    ],
    "deviceOptInStorageKey": "shex_beautify_b5_admin_storage_enabled_v1"
  },
  "beautifyC2CreatorAssets": {
    "masterEnabled": true
  },
  "xLettersV1": {
    "masterEnabled": true,
    "entryMode": "parallel"
  }
};

if (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname) && new URLSearchParams(window.location.search).get('candidateThemes') === '1') {
  window.SHEX_CLOUDBASE_CONFIG.envId = '';
  window.SHEX_CLOUDBASE_CONFIG.sdkUrl = '';
}
