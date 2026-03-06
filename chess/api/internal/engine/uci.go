package engine

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

type Eval struct {
	Type  string `json:"type"`
	Value int    `json:"value"`
}

type Analysis struct {
	BestMove string
	Eval     Eval
	PV       []string
	Depth    int
}

type Engine struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser

	lineCh chan string
	errCh  chan error

	mu     sync.Mutex
	closed bool
}

func New(path string) (*Engine, error) {
	cmd := exec.Command(path)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start stockfish: %w", err)
	}

	e := &Engine{
		cmd:    cmd,
		stdin:  stdinPipe,
		lineCh: make(chan string, 256),
		errCh:  make(chan error, 1),
	}

	go e.readLoop(stdoutPipe)

	if err := e.handshake(); err != nil {
		_ = e.Close()
		return nil, err
	}

	return e, nil
}

func (e *Engine) readLoop(r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		e.lineCh <- scanner.Text()
	}
	if err := scanner.Err(); err != nil {
		e.errCh <- err
		return
	}
	e.errCh <- errors.New("stockfish output stream closed")
}

func (e *Engine) handshake() error {
	ctx := context.Background()
	if err := e.send("uci"); err != nil {
		return err
	}
	if _, err := e.waitFor(ctx, func(line string) bool {
		return strings.TrimSpace(line) == "uciok"
	}); err != nil {
		return fmt.Errorf("uci handshake failed: %w", err)
	}
	if err := e.send("isready"); err != nil {
		return err
	}
	if _, err := e.waitFor(ctx, func(line string) bool {
		return strings.TrimSpace(line) == "readyok"
	}); err != nil {
		return fmt.Errorf("isready failed: %w", err)
	}
	return nil
}

func (e *Engine) send(cmd string) error {
	if e.closed {
		return errors.New("engine closed")
	}
	if e.cmd.ProcessState != nil {
		return errors.New("stockfish exited")
	}
	_, err := fmt.Fprintf(e.stdin, "%s\n", cmd)
	if err != nil {
		return fmt.Errorf("send %q: %w", cmd, err)
	}
	return nil
}

func (e *Engine) waitFor(ctx context.Context, match func(string) bool) (string, error) {
	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case err := <-e.errCh:
			if err == nil {
				err = errors.New("stockfish exited")
			}
			return "", err
		case line := <-e.lineCh:
			if match(line) {
				return line, nil
			}
		}
	}
}

func (e *Engine) Analyze(ctx context.Context, fen string, depth int, movetimeMs int) (Analysis, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.closed {
		return Analysis{}, errors.New("stockfish not available")
	}
	if e.cmd.ProcessState != nil {
		return Analysis{}, errors.New("stockfish exited")
	}

	if err := e.send("ucinewgame"); err != nil {
		return Analysis{}, err
	}
	if err := e.send("isready"); err != nil {
		return Analysis{}, err
	}
	if _, err := e.waitFor(ctx, func(line string) bool {
		return strings.TrimSpace(line) == "readyok"
	}); err != nil {
		return Analysis{}, fmt.Errorf("engine readiness failed: %w", err)
	}

	if err := e.send("position fen " + fen); err != nil {
		return Analysis{}, err
	}

	if movetimeMs > 0 {
		if err := e.send(fmt.Sprintf("go movetime %d", movetimeMs)); err != nil {
			return Analysis{}, err
		}
	} else {
		if depth <= 0 {
			depth = 12
		}
		if err := e.send(fmt.Sprintf("go depth %d", depth)); err != nil {
			return Analysis{}, err
		}
	}

	type parsedInfo struct {
		hasScore bool
		eval     Eval
		pv       []string
		depth    int
	}

	parseInfo := func(line string) parsedInfo {
		parts := strings.Fields(line)
		if len(parts) == 0 || parts[0] != "info" {
			return parsedInfo{}
		}

		out := parsedInfo{}
		for i := 1; i < len(parts); i++ {
			switch parts[i] {
			case "depth":
				if i+1 < len(parts) {
					if n, err := strconv.Atoi(parts[i+1]); err == nil {
						out.depth = n
					}
				}
			case "score":
				if i+2 < len(parts) {
					t := parts[i+1]
					v, err := strconv.Atoi(parts[i+2])
					if err == nil && (t == "cp" || t == "mate") {
						out.hasScore = true
						out.eval = Eval{Type: t, Value: v}
					}
				}
			case "pv":
				if i+1 < len(parts) {
					out.pv = append([]string{}, parts[i+1:]...)
				}
			}
		}
		return out
	}

	latest := Analysis{Depth: depth}
	line, err := e.waitFor(ctx, func(line string) bool {
		if strings.HasPrefix(line, "info ") {
			p := parseInfo(line)
			if p.hasScore && len(p.pv) > 0 && p.depth > 0 {
				latest.Eval = p.eval
				latest.PV = p.pv
				latest.Depth = p.depth
			}
		}
		return strings.HasPrefix(line, "bestmove ")
	})
	if err != nil {
		_ = e.send("stop")
		return Analysis{}, err
	}

	fields := strings.Fields(line)
	if len(fields) >= 2 {
		latest.BestMove = fields[1]
	}
	if latest.BestMove == "" || latest.BestMove == "(none)" {
		return Analysis{}, errors.New("no bestmove from engine")
	}

	return latest, nil
}

func (e *Engine) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.closed {
		return nil
	}
	e.closed = true

	_, _ = fmt.Fprintln(e.stdin, "quit")
	_ = e.stdin.Close()
	if e.cmd.Process != nil {
		_ = e.cmd.Process.Kill()
	}
	_ = e.cmd.Wait()
	return nil
}
