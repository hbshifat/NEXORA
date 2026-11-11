package runner

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"nexora/engine/pkg/dag"
)

// runGit runs a git command in dir and fails the test on error.
func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, out)
	}
	return string(out)
}

// setupRepo creates a bare-bones git repo with a "dev" branch and one
// initial commit, suitable for the engine to branch worktrees off of.
func setupRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runGit(t, dir, "init", "-b", "dev")
	runGit(t, dir, "config", "user.email", "test@example.com")
	runGit(t, dir, "config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("init\n"), 0644); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, "add", "-A")
	runGit(t, dir, "commit", "-m", "init")
	return dir
}

func writeDAGFile(t *testing.T, path string, tasks []*dag.TaskNode) {
	t.Helper()
	raw, err := json.MarshalIndent(dagFile{Tasks: tasks}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0644); err != nil {
		t.Fatal(err)
	}
}

func TestEngine_TwoNodeDAG_BranchInheritance(t *testing.T) {
	repoRoot := setupRepo(t)

	tasks := []*dag.TaskNode{
		{
			ID:             "T1",
			Name:           "write version",
			Dependencies:   nil,
			WorktreeBranch: "task/t1",
			VerifyCommand:  `printf '%s' 'v1.0.0' > version.txt`,
		},
		{
			ID:             "T2",
			Name:           "append enterprise suffix",
			Dependencies:   []string{"T1"},
			WorktreeBranch: "task/t2",
			VerifyCommand:  `printf '%s' '-enterprise' >> version.txt && grep -q 'v1.0.0-enterprise' version.txt`,
		},
	}

	dagPath := filepath.Join(repoRoot, "dag.json")
	writeDAGFile(t, dagPath, tasks)
	statePath := filepath.Join(repoRoot, "state.json")

	engine, err := NewEngine(dagPath, statePath, repoRoot)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}

	if err := engine.Run(); err != nil {
		t.Fatalf("engine.Run: %v", err)
	}

	// Both tasks must have reached StatusCompleted.
	d := engine.DAG()
	for _, id := range []string{"T1", "T2"} {
		if got := d.Tasks[id].Status; got != dag.StatusCompleted {
			t.Errorf("task %s status = %s, want %s", id, got, dag.StatusCompleted)
		}
	}

	// The persisted state ledger must agree.
	raw, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read state file: %v", err)
	}
	var persisted map[string]dag.TaskStatus
	if err := json.Unmarshal(raw, &persisted); err != nil {
		t.Fatalf("unmarshal state file: %v", err)
	}
	for _, id := range []string{"T1", "T2"} {
		if got := persisted[id]; got != dag.StatusCompleted {
			t.Errorf("persisted state[%s] = %s, want %s", id, got, dag.StatusCompleted)
		}
	}

	// Worktrees must be removed after a successful run.
	for _, id := range []string{"T1", "T2"} {
		path := engine.WT.WorktreePath(id)
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Errorf("worktree for %s still exists at %s (err=%v)", id, path, err)
		}
	}
	listOut := runGit(t, repoRoot, "worktree", "list")
	if strings.Count(listOut, "\n") != 1 {
		t.Errorf("expected only the main worktree to remain, got:\n%s", listOut)
	}

	// T2 must have cleanly inherited T1's commit: task/t2 should contain
	// the init commit, T1's commit, and T2's commit (3 total), and the
	// file contents must reflect both tasks' work.
	content := runGit(t, repoRoot, "show", "task/t2:version.txt")
	if content != "v1.0.0-enterprise" {
		t.Errorf("task/t2:version.txt = %q, want %q", content, "v1.0.0-enterprise")
	}

	countOut := strings.TrimSpace(runGit(t, repoRoot, "rev-list", "--count", "task/t2"))
	count, err := strconv.Atoi(countOut)
	if err != nil {
		t.Fatalf("parse rev-list count %q: %v", countOut, err)
	}
	if count != 3 {
		t.Errorf("task/t2 has %d commits, want 3 (init + T1 + T2)", count)
	}

	t1Commit := strings.TrimSpace(runGit(t, repoRoot, "rev-parse", "task/t1"))
	ancestorCmd := exec.Command("git", "merge-base", "--is-ancestor", t1Commit, "task/t2")
	ancestorCmd.Dir = repoRoot
	if err := ancestorCmd.Run(); err != nil {
		t.Errorf("task/t1 commit %s is not an ancestor of task/t2: %v", t1Commit, err)
	}
}

func TestEngine_FailurePropagatesToDependents(t *testing.T) {
	repoRoot := setupRepo(t)

	tasks := []*dag.TaskNode{
		{
			ID:             "T1",
			Name:           "fails",
			Dependencies:   nil,
			WorktreeBranch: "task/t1-fail",
			VerifyCommand:  `exit 1`,
		},
		{
			ID:             "T2",
			Name:           "blocked by T1",
			Dependencies:   []string{"T1"},
			WorktreeBranch: "task/t2-fail",
			VerifyCommand:  `true`,
		},
	}

	dagPath := filepath.Join(repoRoot, "dag.json")
	writeDAGFile(t, dagPath, tasks)
	statePath := filepath.Join(repoRoot, "state.json")

	engine, err := NewEngine(dagPath, statePath, repoRoot)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	if err := engine.Run(); err != nil {
		t.Fatalf("engine.Run: %v", err)
	}

	d := engine.DAG()
	if got := d.Tasks["T1"].Status; got != dag.StatusFailed {
		t.Errorf("T1 status = %s, want %s", got, dag.StatusFailed)
	}
	if got := d.Tasks["T2"].Status; got != dag.StatusFailed {
		t.Errorf("T2 status = %s, want %s (cascaded failure)", got, dag.StatusFailed)
	}
}
