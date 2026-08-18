#!/bin/sh
set -e

missing=""
for v in FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID; do
  eval "val=\$$v"
  if [ -z "$val" ]; then
    missing="$missing $v"
  fi
done

if [ -n "$missing" ]; then
  echo "Missing Cloud Run environment variables:$missing" >&2
  echo "Set them on the Cloud Run service (Variables & secrets), then start a new revision." >&2
  exit 1
fi

js_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/config.js <<EOF
window.__ALUBEE_FIREBASE__ = {
  apiKey: "$(js_escape "$FIREBASE_API_KEY")",
  authDomain: "$(js_escape "$FIREBASE_AUTH_DOMAIN")",
  projectId: "$(js_escape "$FIREBASE_PROJECT_ID")",
  storageBucket: "$(js_escape "$FIREBASE_STORAGE_BUCKET")",
  messagingSenderId: "$(js_escape "$FIREBASE_MESSAGING_SENDER_ID")",
  appId: "$(js_escape "$FIREBASE_APP_ID")",
  vapidKey: "$(js_escape "$FIREBASE_VAPID_KEY")"
};
EOF

cat > /usr/share/nginx/html/firebase-runtime-config.json <<EOF
{
  "apiKey": "$(js_escape "$FIREBASE_API_KEY")",
  "authDomain": "$(js_escape "$FIREBASE_AUTH_DOMAIN")",
  "projectId": "$(js_escape "$FIREBASE_PROJECT_ID")",
  "storageBucket": "$(js_escape "$FIREBASE_STORAGE_BUCKET")",
  "messagingSenderId": "$(js_escape "$FIREBASE_MESSAGING_SENDER_ID")",
  "appId": "$(js_escape "$FIREBASE_APP_ID")"
}
EOF

cat > /usr/share/nginx/html/firebase-sw-config.js <<EOF
self.__ALUBEE_FIREBASE_SW__ = {
  apiKey: "$(js_escape "$FIREBASE_API_KEY")",
  authDomain: "$(js_escape "$FIREBASE_AUTH_DOMAIN")",
  projectId: "$(js_escape "$FIREBASE_PROJECT_ID")",
  storageBucket: "$(js_escape "$FIREBASE_STORAGE_BUCKET")",
  messagingSenderId: "$(js_escape "$FIREBASE_MESSAGING_SENDER_ID")",
  appId: "$(js_escape "$FIREBASE_APP_ID")"
};
EOF

exec nginx -g "daemon off;"
