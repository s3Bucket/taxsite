FROM supabase/postgres:15.1.0.147
COPY init.sh /docker-entrypoint-initdb.d/00-create-roles.sh
COPY init.sql /docker-entrypoint-initdb.d/99-custom-init.sql
RUN chmod +x /docker-entrypoint-initdb.d/00-create-roles.sh
