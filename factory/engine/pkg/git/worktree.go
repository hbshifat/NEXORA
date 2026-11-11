package git

import (
	"fmt"
	"os/exec"
	"path/filepath"
)

// defaultBaseBranch is used when CreateWorktree is called without an
// explicit base branch.
const defaultBaseBranch = "dev"

// WorktreeManager wraps git worktree/commit operations for a single
// repository, rooted at RepoRoot.
type WorktreeManager struct {
	RepoRoot string
}

// NewWorktreeManager returns a WorktreeManager for the repository at
// repoRoot.
func NewWorktreeManager(repoRoot string) *WorktreeManager {
	return &WorktreeManager{RepoRoot: repoRoot}
}

// WorktreePath returns the on-disk path of the worktree for taskID.
func (m *WorktreeManager) WorktreePath(taskID string) string {
	return filepath.Join(m.RepoRoot, ".worktrees", taskID)
}

func (m *WorktreeManager) runGitIn(dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %v (in %s): %w: %s", args, dir, err, out)
	}
	return nil
}

func (m *WorktreeManager) runGit(args ...string) error {
	return m.runGitIn(m.RepoRoot, args...)
}

// CreateWorktree creates a new worktree for taskID at .worktrees/<taskID>,
// checking out a new branch targetBranch. If baseBranch is empty, the
// worktree branches off the current "dev" branch; otherwise it branches off
// baseBranch (used to inherit a dependency's committed changes).
func (m *WorktreeManager) CreateWorktree(taskID, targetBranch, baseBranch string) error {
	if baseBranch == "" {
		baseBranch = defaultBaseBranch
	}
	path := m.WorktreePath(taskID)
	return m.runGit("worktree", "add", path, "-b", targetBranch, baseBranch)
}

// RemoveWorktree force-removes the worktree for taskID. The branch itself
// (and its commits) is left intact.
func (m *WorktreeManager) RemoveWorktree(taskID string) error {
	path := m.WorktreePath(taskID)
	return m.runGit("worktree", "remove", "--force", path)
}

// Commit stages and commits all modified files inside the worktree for
// taskID.
func (m *WorktreeManager) Commit(taskID, message string) error {
	path := m.WorktreePath(taskID)
	if err := m.runGitIn(path, "add", "-A"); err != nil {
		return err
	}
	return m.runGitIn(path, "commit", "-m", message)
}
