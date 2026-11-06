// Command sim is the simulator backend.
//
//	sim controller   HTTP/WS API on :18080, spawns and supervises the workers
//	sim worker --id N   one Temporal worker process (spawned by the controller)
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/omjogani/temporal-simulator/backend/internal/controller"
	"github.com/omjogani/temporal-simulator/backend/internal/orders"
)

func main() {
	log.SetFlags(log.Ltime)
	if len(os.Args) < 2 {
		usage()
	}
	switch os.Args[1] {
	case "controller":
		runController(os.Args[2:])
	case "worker":
		runWorker(os.Args[2:])
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: sim controller [flags] | sim worker --id N [flags]")
	os.Exit(2)
}

func runController(args []string) {
	fs := flag.NewFlagSet("controller", flag.ExitOnError)
	port := fs.Int("port", 18080, "HTTP/WebSocket port")
	temporal := fs.String("temporal", envOr("TEMPORAL_ADDRESS", "localhost:17233"), "Temporal gRPC host:port")
	container := fs.String("container", "temporal-sim", "Docker container the Temporal hammer kills")
	ui := fs.String("ui", "http://localhost:18233", "Temporal Web UI URL shown in the app")
	_ = fs.Parse(args)

	exe, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	c, err := controller.New(controller.Config{
		Port: *port, TemporalHostPort: *temporal, Container: *container, TemporalUI: *ui, Exe: exe,
	})
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := c.Run(ctx); err != nil {
		log.Fatal(err)
	}
}

func runWorker(args []string) {
	fs := flag.NewFlagSet("worker", flag.ExitOnError)
	id := fs.Int("id", 1, "worker number (1-4)")
	temporal := fs.String("temporal", envOr("TEMPORAL_ADDRESS", "localhost:17233"), "Temporal gRPC host:port")
	ctrl := fs.String("controller", "http://127.0.0.1:18080", "controller base URL (events + Payments API)")
	_ = fs.Parse(args)
	if err := orders.RunWorker(*id, *temporal, *ctrl); err != nil {
		log.Fatal(err)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
