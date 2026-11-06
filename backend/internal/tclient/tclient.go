// Package tclient builds Temporal clients tuned for a demo where the server is
// killed and restarted: reconnect quickly instead of gRPC's default backoff
// (which can wait up to two minutes), and keep the SDK logs quiet.
package tclient

import (
	"context"
	"log/slog"
	"os"
	"time"

	"go.temporal.io/sdk/client"
	tlog "go.temporal.io/sdk/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/backoff"
)

// Options returns client options for the given host:port.
func Options(hostPort, identity string) client.Options {
	return client.Options{
		HostPort: hostPort,
		Identity: identity,
		Logger:   tlog.NewStructuredLogger(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))),
		ConnectionOptions: client.ConnectionOptions{
			DialOptions: []grpc.DialOption{
				grpc.WithConnectParams(grpc.ConnectParams{
					Backoff:           backoff.Config{BaseDelay: 200 * time.Millisecond, Multiplier: 1.3, Jitter: 0.1, MaxDelay: time.Second},
					MinConnectTimeout: time.Second,
				}),
			},
		},
	}
}

// DialWithRetry blocks until the server answers (used by workers, which may be
// started while Temporal is down).
func DialWithRetry(ctx context.Context, hostPort, identity string) (client.Client, error) {
	for {
		c, err := client.DialContext(ctx, Options(hostPort, identity))
		if err == nil {
			return c, nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}
