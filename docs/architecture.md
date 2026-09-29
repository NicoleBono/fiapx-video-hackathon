# Arquitetura — FIAP X Sistema de Processamento de Vídeos

## Visão geral

```mermaid
flowchart LR
    Client((Cliente))

    subgraph Public["Serviços públicos (HTTP)"]
        Auth[auth-service]
        Video[video-service]
    end

    subgraph Workers["Workers (sem HTTP público)"]
        Proc[processing-service]
        Notif[notification-service]
    end

    subgraph Infra
        PG[(PostgreSQL\nauth_db / video_db)]
        Redis[(Redis)]
        MQ{{RabbitMQ\nexchange: video-events}}
        Minio[(MinIO\nvideos-raw / videos-zips)]
        Mail[[MailHog / SMTP]]
    end

    Client -->|register/login| Auth
    Client -->|upload / status / download, JWT| Video

    Auth --> PG
    Video --> PG
    Video --> Redis
    Video -->|arquivo bruto| Minio
    Video -->|publish video.uploaded| MQ
    MQ -->|video.uploaded| Proc
    Proc -->|download raw / upload zip| Minio
    Proc -->|publish processing.started / completed / failed| MQ
    MQ -->|status events| Video
    MQ -->|video.failed| Notif
    Notif --> Mail
```

**Por que esse desenho:**
- **Upload não bloqueante**: `video-service` só persiste metadados + sobe o arquivo pro MinIO + publica um evento. Responde `202` na hora. Isso é o que garante que picos de requisições não derrubam nem perdem o processamento (a fila absorve o burst).
- **Escalar o processamento**: `processing-service` não guarda estado; qualquer número de réplicas (`docker compose up --scale processing-service=N`) pode consumir a mesma fila em paralelo.
- **DB-per-service**: cada serviço só enxerga o próprio banco/credenciais (`auth_db`, `video_db` no mesmo container Postgres, por economia de recursos — mas logicamente isolados). Nenhum serviço acessa a tabela de outro diretamente; tudo passa por evento.
- **MinIO em vez de disco local**: desacopla o armazenamento de arquivo dos containers de processamento, permitindo múltiplas réplicas sem volume compartilhado e é compatível com S3 (troca fácil por um bucket real em produção).
- **JWT autocontido**: o `auth-service` assina o token com `email` no payload; os outros serviços validam localmente (sem round-trip síncrono a cada request).

## Contrato entre serviços (fonte da verdade para implementação)

### JWT

- Header: `Authorization: Bearer <token>`
- Secret: env `JWT_SECRET` (mesmo valor em `auth-service` e `video-service`)
- Payload: `{ sub: string /* userId */, username: string, email: string }`
- Expiração: env `JWT_EXPIRES_IN` (default `3600s`)

### RabbitMQ

- Env de conexão em todos os serviços que usam fila: `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672`
- Exchange única, tipo **topic**: env `RABBITMQ_EXCHANGE=video-events`
- Routing keys e filas:

| Routing key | Fila | Publicado por | Consumido por |
|---|---|---|---|
| `video.uploaded` | `video.processing.queue` | video-service | processing-service |
| `video.processing.started` | `video.status.queue` | processing-service | video-service |
| `video.completed` | `video.status.queue` | processing-service | video-service |
| `video.failed` | `video.status.queue` + `video.notification.queue` | processing-service | video-service e notification-service |

- Ack manual em todos os consumidores. `processing-service` reprocessa (nack + requeue) até `RABBITMQ_MAX_RETRIES` (default 3, controlado por um header `x-retry-count` na própria mensagem); ao esgotar as tentativas, publica `video.failed` com `permanent: true` e faz *ack* (não deixa a mensagem presa). A fila `video.processing.queue` também tem `x-dead-letter-exchange` configurado como rede de segurança para o caso do consumidor cair sem dar nack (crash do processo).

- Payloads (JSON), sempre incluindo `videoId`:
  ```ts
  // video.uploaded
  { videoId: string, userId: string, email: string, objectKey: string, originalFilename: string }

  // video.processing.started
  { videoId: string }

  // video.completed
  { videoId: string, frameCount: number, zipObjectKey: string }

  // video.failed
  { videoId: string, userId: string, email: string, errorMessage: string, permanent: boolean }
  ```

### MinIO (S3-compatible)

Env comuns a video-service e processing-service:
```
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=fiapx
MINIO_SECRET_KEY=fiapx12345
MINIO_USE_SSL=false
MINIO_BUCKET_RAW=videos-raw
MINIO_BUCKET_ZIPS=videos-zips
```
- Object key do vídeo bruto: `{videoId}/{originalFilename}`
- Object key do zip: `{videoId}/frames.zip`
- Cada serviço garante a existência dos buckets no startup (`bucketExists` / `makeBucket`), não há container de init separado.

### Redis (cache, só video-service)

```
REDIS_HOST=redis
REDIS_PORT=6379
```
- Chave: `videos:user:{userId}` → lista de vídeos/status (TTL 10s, cache-aside). Invalidar (del) a cada `POST /videos/upload` e a cada atualização de status.

### Postgres

```
# auth-service
DATABASE_URL=postgresql://auth_user:auth_pass@postgres:5432/auth_db

# video-service
DATABASE_URL=postgresql://video_user:video_pass@postgres:5432/video_db
```

### SMTP (notification-service)

```
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_FROM=noreply@fiapx.com
```
Sem autenticação (MailHog). Em produção, trocar por credenciais reais via env.

## Modelos de dados

**auth_db.User**: `id (uuid), username (unique), email (unique), passwordHash, createdAt`

**video_db.Video**: `id (uuid), userId, email, originalFilename, status (PENDING|PROCESSING|DONE|FAILED), zipObjectKey (nullable), frameCount (nullable), errorMessage (nullable), createdAt, updatedAt`

## Escalabilidade

- `processing-service` é *stateless* e horizontalmente escalável (`docker compose up --scale processing-service=3`); o RabbitMQ distribui as mensagens entre as réplicas (round-robin com prefetch=1 por consumidor).
- `video-service` também pode rodar em múltiplas réplicas atrás de um load balancer (não há estado em memória; sessão é via JWT stateless).
- Picos de upload não derrubam o processamento: a fila persiste as mensagens (`durable: true`, mensagens `persistent`) até haver capacidade de consumo.

## Como rodar

```
docker compose up --build
```

- auth-service: http://localhost:3001 (Swagger em `/swagger/api-docs`)
- video-service: http://localhost:3000 (Swagger em `/swagger/api-docs`)
- RabbitMQ management: http://localhost:15672 (guest/guest)
- MinIO console: http://localhost:9001 (fiapx/fiapx12345)
- MailHog UI: http://localhost:8025
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002 (admin/admin) — dashboard "FIAP X - Visão Geral" já provisionado

## Monitoramento

Todos os serviços expõem métricas Prometheus (`GET /metrics`; os workers
`processing-service`/`notification-service`, que não têm servidor HTTP, sobem um
mini servidor só para isso na porta `METRICS_PORT`). O RabbitMQ expõe as suas
próprias métricas nativas via plugin `rabbitmq_prometheus`. O Prometheus faz o
scrape de todos e o Grafana já vem com o datasource e um dashboard prontos
(uploads/downloads, latência HTTP, jobs de processamento, notificações, filas do
RabbitMQ e memória por processo). Detalhes em [`README.md`](../README.md#monitoramento).
