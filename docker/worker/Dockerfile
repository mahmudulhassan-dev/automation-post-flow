FROM golang:1.26-alpine AS builder

WORKDIR /src
COPY go.mod ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/amanaflow-worker ./cmd/worker

FROM alpine:3.21
WORKDIR /app
COPY --from=builder /out/amanaflow-worker /usr/local/bin/amanaflow-worker
CMD ["amanaflow-worker"]
