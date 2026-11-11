package runner

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"nexora/engine/pkg/dag"
	"nexora/engine/pkg/git"
)

// dagFile is the on-disk JSON shape of a dag.json file: a flat list of
// tasks, which is more convenient to author than a map.
type dagFile struct {
	Tasks []*dag.TaskNode `json:"tasks"`
}

// LoadDAG reads and validates a dag.json file.
func LoadDAG(path string) (*dag.DAG, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read dag file: %w", err)
	}
	var df dagFile
	if err := json.Unmarshal(raw, &df); err != nil {
		return nil, fmt.Errorf("parse dag file: %w", err)
	}

	d := dag.NewDAG()
	for _, t := range df.Tasks {
		t.Status = dag.StatusPending
		if err := d.AddTask(t); err != nil {
			return nil, err
		}
	}
	if err := d.Validate(); err != nil {
		return nil, fmt.Errorf("invalid dag: %w", err)
	}
	return d, nil
}

// Engine runs a DAG to completion, deterministically, against a git
// repository's worktrees.
type Engine struct {
	StatePath string
	RepoRoot  string
	WT        *git.WorktreeManager

	mu  sync.Mutex
	dag *dag.DAG
}

// NewEngine constructs an Engine from a dag.json file. statePath is where
// the state ledger is persisted; repoRoot is the git repository the
// worktrees are created inside.
func NewEngine(dagPath, statePath, repoRoot string) (*Engine, error) {
	d, err := LoadDAG(dagPath)
	if err != nil {
		return nil, err
	}
	return &Engine{
		StatePath: statePath,
		RepoRoot:  repoRoot,
		WT:        git.NewWorktreeManager(repoRoot),
		dag:       d,
	}, nil
}

// DAG exposes the engine's current DAG state (for inspection in tests).
func (e *Engine) DAG() *dag.DAG {
	return e.dag
}

// persistState atomically writes the current status of every task to
// StatePath. Callers must hold e.mu.
func (e *Engine) persistState() error {
	if e.StatePath == "" {
		return nil
	}
	state := make(map[string]dag.TaskStatus, len(e.dag.Tasks))
	for id, t := range e.dag.Tasks {
		state[id] = t.Status
	}
	raw, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}

	dir := filepath.Dir(e.StatePath)
	tmp, err := os.CreateTemp(dir, ".state-*.json.tmp")
	if err != nil {
		return fmt.Errorf("create temp state file: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write temp state file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp state file: %w", err)
	}
	if err := os.Rename(tmpPath, e.StatePath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename temp state file: %w", err)
	}
	return nil
}

// taskResult is sent back on the results channel when a task's execution
// (verify + commit + worktree teardown) finishes.
type taskResult struct {
	id  string
	err error
}

// Run drives the DAG to completion: it repeatedly starts every task whose
// dependencies have all completed, waits for running tasks to finish, and
// stops when no task is running and none is ready (either everything
// terminated, or the graph is stuck).
func (e *Engine) Run() error {
	e.mu.Lock()
	if err := e.dag.Validate(); err != nil {
		e.mu.Unlock()
		return err
	}
	e.mu.Unlock()

	results := make(chan taskResult)
	running := 0

	for {
		e.mu.Lock()
		ready := e.dag.ReadyTasks()
		for _, t := range ready {
			t.Status = dag.StatusReady
		}
		if err := e.persistState(); err != nil {
			e.mu.Unlock()
			return err
		}
		for _, t := range ready {
			t.Status = dag.StatusRunning
		}
		if err := e.persistState(); err != nil {
			e.mu.Unlock()
			return err
		}
		baseBranches := make(map[string]string, len(ready))
		for _, t := range ready {
			baseBranches[t.ID] = e.baseBranchFor(t)
		}
		e.mu.Unlock()

		for _, t := range ready {
			running++
			go e.execute(t, baseBranches[t.ID], results)
		}

		if running == 0 {
			// Nothing ready and nothing in flight: either every task has
			// reached a terminal state, or the graph is stuck (e.g. a
			// failure upstream left dependents blocked forever).
			break
		}

		res := <-results
		running--

		e.mu.Lock()
		t := e.dag.Tasks[res.id]
		if res.err == nil {
			t.Status = dag.StatusCompleted
		} else {
			t.Status = dag.StatusFailed
			e.cascadeFailure(t.ID)
		}
		err := e.persistState()
		e.mu.Unlock()
		if err != nil {
			return err
		}
	}
	return nil
}

// baseBranchFor implements the branch inheritance rule: a task's worktree
// branches off its dependency's branch, so it inherits that dependency's
// committed changes. Callers must hold e.mu.
func (e *Engine) baseBranchFor(t *dag.TaskNode) string {
	if len(t.Dependencies) == 0 {
		return ""
	}
	dep := e.dag.Tasks[t.Dependencies[0]]
	return dep.WorktreeBranch
}

// cascadeFailure marks every task that (transitively) depends on failedID
// as failed too, so the run loop can reach a terminal state instead of
// leaving blocked dependents pending forever. Callers must hold e.mu.
func (e *Engine) cascadeFailure(failedID string) {
	changed := true
	for changed {
		changed = false
		for _, t := range e.dag.Tasks {
			if t.Status != dag.StatusPending {
				continue
			}
			for _, dep := range t.Dependencies {
				if e.dag.Tasks[dep].Status == dag.StatusFailed {
					t.Status = dag.StatusFailed
					changed = true
					break
				}
			}
		}
	}
}

// execute runs a single task to completion: create its worktree (branched
// off baseBranch), run its verify command inside it, and commit on success.
// The worktree is always torn down afterwards — on success or failure alike
// — so .worktrees/ never accumulates stale directories from failed runs.
// The result is sent on results.
func (e *Engine) execute(t *dag.TaskNode, baseBranch string, results chan<- taskResult) {
	if err := e.WT.CreateWorktree(t.ID, t.WorktreeBranch, baseBranch); err != nil {
		results <- taskResult{id: t.ID, err: fmt.Errorf("create worktree: %w", err)}
		return
	}

	taskErr := e.verifyAndCommit(t)

	if rmErr := e.WT.RemoveWorktree(t.ID); rmErr != nil && taskErr == nil {
		taskErr = fmt.Errorf("remove worktree: %w", rmErr)
	}

	results <- taskResult{id: t.ID, err: taskErr}
}

// verifyAndCommit runs t's verify command and, on success, commits any
// resulting changes. It does not touch the worktree's lifecycle.
func (e *Engine) verifyAndCommit(t *dag.TaskNode) error {
	if err := runVerifyCommand(e.WT.WorktreePath(t.ID), t.VerifyCommand); err != nil {
		return fmt.Errorf("verify command: %w", err)
	}
	if err := e.WT.Commit(t.ID, fmt.Sprintf("task %s: %s", t.ID, t.Name)); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}
