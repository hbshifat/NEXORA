// Command engine runs a dag.json file to completion with the deterministic
// Go DAG engine, keeping factory/board.json (and therefore
// factory/dashboard.html) in sync with task progress as it goes.
package main

import (
	"flag"
	"fmt"
	"os"

	"nexora/engine/pkg/dag"
	"nexora/engine/pkg/runner"
)

func main() {
	dagPath := flag.String("dag", "", "path to dag.json (required)")
	statePath := flag.String("state", "factory/state.json", "path to the state ledger")
	boardPath := flag.String("board", "factory/board.json", "path to the dashboard board file")
	repoRoot := flag.String("repo", ".", "repository root containing the git worktrees")
	flag.Parse()

	if *dagPath == "" {
		fmt.Fprintln(os.Stderr, "error: -dag is required")
		flag.Usage()
		os.Exit(2)
	}

	engine, err := runner.NewEngine(*dagPath, *statePath, *repoRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	engine.BoardPath = *boardPath

	if err := engine.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	failed := false
	for id, t := range engine.DAG().Tasks {
		if t.Status == dag.StatusFailed {
			fmt.Fprintf(os.Stderr, "task failed: %s\n", id)
			failed = true
		}
	}
	if failed {
		os.Exit(1)
	}
}
