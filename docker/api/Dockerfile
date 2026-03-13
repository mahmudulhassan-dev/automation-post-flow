FROM golang:1.26-alpine AS builder

WORKDIR /src
COPY go.mod ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/amanaflow-api ./cmd/api

FROM alpine:3.21
WORKDIR /app
COPY --from=builder /out/amanaflow-api /usr/local/bin/amanaflow-api
EXPOSE 8080
CMD ["amanaflow-api"]
