# Worker image: the same `sim` binary, run as `sim worker`.
FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sim ./cmd/sim

FROM alpine:3.22
COPY --from=build /out/sim /usr/local/bin/sim
USER 65534:65534
ENTRYPOINT ["sim", "worker"]
