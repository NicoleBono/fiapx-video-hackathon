# FIAP X — Sistema de Processamento de Vídeos

Recebe vídeos via API, extrai os frames de forma assíncrona e devolve um `.zip`
com as imagens. Se o processamento falhar, o usuário é notificado por e-mail.

Arquitetura completa e contrato entre serviços: [`docs/architecture.md`](docs/architecture.md).

## Serviços

| Serviço | Tipo | Porta | Responsabilidade |
|---|---|---|---|
| `auth-service` | HTTP | 3001 | Registro, login e emissão de JWT |
| `video-service` | HTTP | 3000 | Upload, consulta de status e download do zip |
| `processing-service` | worker | — | Consome a fila, extrai frames (ffmpeg), zipa e sobe no MinIO |
| `notification-service` | worker | — | Consome falhas e envia e-mail (SMTP/MailHog) |

Infra (via Docker Compose): PostgreSQL, Redis, RabbitMQ, MinIO, MailHog, Prometheus, Grafana.

Stack: Node.js 20 + NestJS 10 + TypeORM (Postgres) · RabbitMQ (`amqplib`) ·
MinIO (S3) · Redis (`ioredis`) · `fluent-ffmpeg` · `nodemailer` · Prometheus + Grafana.

## Pré-requisitos

- Docker + Docker Compose v2
- Portas livres no host: `3000`, `3001`, `5432`, `6379`, `5672`, `15672`, `15692`,
  `9000`, `9001`, `9090`, `1025`, `8025`, `3002`
  (`9100`/`9101` — métricas dos workers — não são publicadas no host de propósito, veja "Monitoramento")

## Como rodar

```bash
docker compose up --build
```

Para escalar o processamento (workers stateless, RabbitMQ distribui round-robin):

```bash
docker compose up --build --scale processing-service=3
```

### Consoles

| O quê | URL | Credenciais |
|---|---|---|
| Swagger auth-service | http://localhost:3001/swagger/api-docs | — |
| Swagger video-service | http://localhost:3000/swagger/api-docs | — |
| RabbitMQ management | http://localhost:15672 | `guest` / `guest` |
| MinIO console | http://localhost:9001 | `fiapx` / `fiapx12345` |
| MailHog (inbox) | http://localhost:8025 | — |
| Grafana | http://localhost:3002 | `admin` / `admin` |
| Prometheus | http://localhost:9090 | — |

## Fluxo de uso

```bash
# 1) Registrar (ou usar /login se já existe) -> retorna accessToken
curl -s -X POST http://localhost:3001/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"nicole","email":"nicole@fiapx.com","password":"S3nhaForte!"}'

# 2) Login
TOKEN=$(curl -s -X POST http://localhost:3001/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nicole@fiapx.com","password":"S3nhaForte!"}' \
  | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')

# 3) Upload do vídeo -> HTTP 202, status PENDING
curl -s -X POST http://localhost:3000/videos/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/caminho/do/video.mp4;type=video/mp4"

# 4) Consultar status (lista os vídeos do usuário; cache Redis de 10s)
curl -s http://localhost:3000/videos -H "Authorization: Bearer $TOKEN"
#  status: PENDING -> PROCESSING -> DONE (com frameCount) | FAILED (com errorMessage)

# 5) Baixar o zip dos frames (só quando status = DONE)
curl -s -OJ http://localhost:3000/videos/<videoId>/download \
  -H "Authorization: Bearer $TOKEN"
```

Em caso de falha no processamento, um e-mail cai no MailHog (http://localhost:8025).

## Endpoints

### auth-service (`:3001`)

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| `POST` | `/register` | `{ username, email, password }` | `201 { accessToken }` |
| `POST` | `/login` | `{ email, password }` | `200 { accessToken }` · `401` se inválido |

### video-service (`:3000`) — exige `Authorization: Bearer <token>`

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| `POST` | `/videos/upload` | `multipart/form-data`, campo `file` | `202` + metadados do vídeo |
| `GET` | `/videos` | — | `200` lista de vídeos do usuário |
| `GET` | `/videos/:id/download` | — | `200` `application/zip` · `404` se não for dono / zip indisponível |

## Modelo de dados (`video_db.videos`)

`id (uuid)`, `userId`, `email`, `originalFilename`,
`status (PENDING | PROCESSING | DONE | FAILED)`,
`zipObjectKey?`, `frameCount?`, `errorMessage?`, `createdAt`, `updatedAt`.

## Mensageria

Exchange `video-events` (topic) + `video-events.dlx` (fanout, rede de segurança).

| Routing key | Fila | Publicado por | Consumido por |
|---|---|---|---|
| `video.uploaded` | `video.processing.queue` | video-service | processing-service |
| `video.processing.started` | `video.status.queue` | processing-service | video-service |
| `video.completed` | `video.status.queue` | processing-service | video-service |
| `video.failed` | `video.status.queue` + `video.notification.queue` | processing-service | video-service e notification-service |

- Ack manual, `prefetch=1`, mensagens e filas `durable`/`persistent`.
- Retry controlado pelo header `x-retry-count` até `RABBITMQ_MAX_RETRIES` (default 3);
  ao esgotar, publica `video.failed` com `permanent: true` e faz ack (não deixa mensagem presa).
- `video.processing.queue` tem `x-dead-letter-exchange` para o caso de o worker cair sem nack.

## Monitoramento

Prometheus + Grafana, provisionados automaticamente (datasource e dashboard já vêm
prontos ao subir o compose — nada pra configurar na mão).

- Os 2 serviços HTTP (`auth-service`, `video-service`) expõem `GET /metrics` na
  própria porta da API.
- Os 2 workers (`processing-service`, `notification-service`) não têm servidor HTTP,
  então cada um sobe um mini servidor só para `/metrics` (`METRICS_PORT`, portas
  `9100`/`9101`) — **só na rede interna do compose**, sem publicar no host de
  propósito: `processing-service` é o serviço pensado pra escalar
  (`--scale processing-service=N`), e porta fixa publicada no host impede subir
  mais de uma réplica ("port is already allocated"). O Prometheus alcança
  `/metrics` de qualquer réplica pela rede interna normalmente.
- O RabbitMQ expõe métricas nativas via plugin `rabbitmq_prometheus`
  ([infra/rabbitmq/enabled_plugins](infra/rabbitmq/enabled_plugins)), porta `15692`.
- Prometheus faz scrape dos 5 alvos a cada 10s ([infra/prometheus/prometheus.yml](infra/prometheus/prometheus.yml));
  alvos e saúde do scrape em http://localhost:9090/targets.
- Grafana já sobe com o datasource do Prometheus e o dashboard **"FIAP X - Visão
  Geral"** provisionados ([infra/grafana/provisioning/](infra/grafana/provisioning/)),
  com painéis de: taxa e latência (p95) das requisições HTTP, uploads/downloads de
  vídeo por minuto, eventos de status consumidos, jobs de processamento por
  resultado, notificações enviadas, profundidade das filas do RabbitMQ e memória de
  cada processo Node.

Métricas de negócio expostas (além das métricas padrão de processo/Node em cada
serviço):

| Métrica | Serviço | Labels |
|---|---|---|
| `http_request_duration_seconds` | auth, video | `method`, `route`, `status_code` |
| `auth_registrations_total` / `auth_logins_total` | auth | `result` (logins) |
| `videos_uploaded_total` / `video_downloads_total` | video | — |
| `video_status_events_total` | video | `routing_key` |
| `processing_jobs_total` / `processing_job_duration_seconds` / `processing_frames_extracted` | processing | `result` |
| `notifications_sent_total` | notification | `result` |

## Variáveis de ambiente

Cada serviço traz um `.env.example`. No Compose os valores já vêm definidos.
Destaques:

- `JWT_SECRET` — **precisa ser o mesmo** em `auth-service` e `video-service`
- `DATABASE_URL` — bancos isolados por serviço (`auth_db`, `video_db`), criados por [`infra/postgres/init.sql`](infra/postgres/init.sql)
- `RABBITMQ_URL`, `RABBITMQ_EXCHANGE`, `RABBITMQ_MAX_RETRIES`
- `MINIO_*` — endpoint, credenciais e buckets (`videos-raw`, `videos-zips`; criados no startup)
- `REDIS_HOST` / `REDIS_PORT` — cache do `video-service`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` — envio de e-mail (`notification-service`)
- `FRAME_RATE` — frames por segundo extraídos pelo ffmpeg (default `1`)
- `METRICS_PORT` — porta do servidor de métricas dos workers (`processing-service`: `9100`, `notification-service`: `9101`)

## Estrutura

```
.
├── auth-service/          NestJS + TypeORM (auth_db)
├── video-service/         NestJS + TypeORM (video_db) + Redis + MinIO + RabbitMQ
├── processing-service/    NestJS worker — ffmpeg + archiver
├── notification-service/  NestJS worker — nodemailer
├── infra/postgres/        init.sql (cria auth_db / video_db)
├── infra/rabbitmq/        enabled_plugins (habilita métricas Prometheus)
├── infra/prometheus/      prometheus.yml (scrape dos 5 alvos)
├── infra/grafana/         datasource + dashboard provisionados
├── docs/architecture.md   contrato entre serviços (fonte da verdade)
├── .github/workflows/     CI (build + testes nos 4 serviços)
└── docker-compose.yml
```

## Testes e CI

Cada serviço tem testes unitários (mockando RabbitMQ/MinIO/Redis/SMTP/repositórios —
não dependem de infra real) e `auth-service`/`video-service` também têm testes e2e
(HTTP real via `supertest`, contra um módulo Nest com a camada de dados substituída).

Rodando localmente, em qualquer serviço:

```bash
npm install
npm test           # unitários
npm run test:cov   # unitários com cobertura
npm run test:e2e   # só em auth-service e video-service
```

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em todo push/PR
para `main`: para os 4 serviços — install, lint, build, testes unitários e e2e (quando
existem) — mais validação do `docker-compose.yml` e build das 4 imagens Docker.

## Escalabilidade

- `processing-service` é stateless: `--scale processing-service=N` consome a mesma fila em paralelo.
- `video-service` também roda em múltiplas réplicas (sessão via JWT stateless).
- Upload não bloqueante: o `video-service` responde `202` após persistir metadados + subir o arquivo + publicar o evento; picos de tráfego ficam absorvidos pela fila.

## Desenvolvimento local (sem Docker)

Em cada serviço:

```bash
npm install
cp .env.example .env   # ajuste host de Postgres/Redis/RabbitMQ/MinIO para localhost
npm run start:dev
```
