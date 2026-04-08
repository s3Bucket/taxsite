FROM nginx:alpine

# Supabase JS SDK herunterladen (UMD-Bundle → window.supabase)
RUN apk add --no-cache wget && \
    wget -q -O /tmp/supabase.js \
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html

RUN cp /tmp/supabase.js /usr/share/nginx/html/supabase.js
