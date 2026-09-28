-- Cria bancos e usuários isolados por serviço (DB-per-service no mesmo container).
CREATE USER auth_user WITH PASSWORD 'auth_pass';
CREATE DATABASE auth_db OWNER auth_user;

CREATE USER video_user WITH PASSWORD 'video_pass';
CREATE DATABASE video_db OWNER video_user;
