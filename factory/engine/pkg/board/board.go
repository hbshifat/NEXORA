// Package board writes the JSON document factory/dashboard.html polls to
// visualize engine progress.
package board

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Job mirrors one dashboard card. Field names match the JSON shape
// dashboard.html expects.
type Job struct {
	ID      string            `json:"id"`
	Feature string            `json:"feature"`
	Stage   string            `json:"stage"`
	Round   int               `json:"round"`
	Reviews map[string]string `json:"reviews,omitempty"`
}

// Board is the top-level board.json document.
type Board struct {
	Jobs []Job `json:"jobs"`
}

// Write atomically writes jobs to path as a Board document. dashboard.html
// polls this file every two seconds with cache: no-store, so the write goes
// through a temp file + rename rather than a direct write, to guarantee the
// dashboard never observes a half-written file.
func Write(path string, jobs []Job) error {
	raw, err := json.MarshalIndent(Board{Jobs: jobs}, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal board: %w", err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create board dir: %w", err)
	}

	tmp, err := os.CreateTemp(dir, ".board-*.json.tmp")
	if err != nil {
		return fmt.Errorf("create temp board file: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write temp board file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp board file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename temp board file: %w", err)
	}
	return nil
}
