package dag

import (
	"fmt"
	"strings"
)

// TaskStatus represents the lifecycle state of a TaskNode.
type TaskStatus string

const (
	StatusPending   TaskStatus = "PENDING"
	StatusReady     TaskStatus = "READY"
	StatusRunning   TaskStatus = "RUNNING"
	StatusCompleted TaskStatus = "COMPLETED"
	StatusFailed    TaskStatus = "FAILED"
)

// TaskNode is a single unit of work in the DAG.
type TaskNode struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Dependencies   []string   `json:"dependencies"`
	WorktreeBranch string     `json:"worktree_branch"`
	VerifyCommand  string     `json:"verify_command"`
	Status         TaskStatus `json:"status"`
}

// DAG is a directed acyclic graph of TaskNodes, keyed by task ID.
type DAG struct {
	Tasks map[string]*TaskNode `json:"tasks"`
}

// NewDAG returns an empty DAG.
func NewDAG() *DAG {
	return &DAG{Tasks: make(map[string]*TaskNode)}
}

// AddTask registers a task in the DAG. Status defaults to StatusPending.
func (d *DAG) AddTask(t *TaskNode) error {
	if t.ID == "" {
		return fmt.Errorf("task ID cannot be empty")
	}
	if _, exists := d.Tasks[t.ID]; exists {
		return fmt.Errorf("task %q already exists", t.ID)
	}
	if t.Status == "" {
		t.Status = StatusPending
	}
	d.Tasks[t.ID] = t
	return nil
}

// Validate checks that all dependencies reference known tasks and that the
// graph contains no cycles.
func (d *DAG) Validate() error {
	for id, t := range d.Tasks {
		for _, dep := range t.Dependencies {
			if _, ok := d.Tasks[dep]; !ok {
				return fmt.Errorf("task %q depends on unknown task %q", id, dep)
			}
		}
	}
	return d.detectCycles()
}

const (
	colorWhite = 0
	colorGray  = 1
	colorBlack = 2
)

func (d *DAG) detectCycles() error {
	color := make(map[string]int, len(d.Tasks))

	var visit func(id string, path []string) error
	visit = func(id string, path []string) error {
		switch color[id] {
		case colorBlack:
			return nil
		case colorGray:
			return fmt.Errorf("cycle detected: %s", strings.Join(append(path, id), " -> "))
		}
		color[id] = colorGray
		path = append(path, id)
		for _, dep := range d.Tasks[id].Dependencies {
			if err := visit(dep, path); err != nil {
				return err
			}
		}
		color[id] = colorBlack
		return nil
	}

	for id := range d.Tasks {
		if err := visit(id, nil); err != nil {
			return err
		}
	}
	return nil
}

// TopologicalOrder returns task IDs ordered so that every task appears after
// its dependencies. It returns an error if the DAG is invalid.
func (d *DAG) TopologicalOrder() ([]string, error) {
	if err := d.Validate(); err != nil {
		return nil, err
	}

	order := make([]string, 0, len(d.Tasks))
	visited := make(map[string]bool, len(d.Tasks))

	var visit func(id string)
	visit = func(id string) {
		if visited[id] {
			return
		}
		visited[id] = true
		for _, dep := range d.Tasks[id].Dependencies {
			visit(dep)
		}
		order = append(order, id)
	}

	for id := range d.Tasks {
		visit(id)
	}
	return order, nil
}

// ReadyTasks returns all tasks that are StatusPending and whose dependencies
// have all completed.
func (d *DAG) ReadyTasks() []*TaskNode {
	var ready []*TaskNode
	for _, t := range d.Tasks {
		if t.Status != StatusPending {
			continue
		}
		allDepsCompleted := true
		for _, dep := range t.Dependencies {
			if d.Tasks[dep].Status != StatusCompleted {
				allDepsCompleted = false
				break
			}
		}
		if allDepsCompleted {
			ready = append(ready, t)
		}
	}
	return ready
}

// AllTerminal reports whether every task is either StatusCompleted or
// StatusFailed.
func (d *DAG) AllTerminal() bool {
	for _, t := range d.Tasks {
		if t.Status != StatusCompleted && t.Status != StatusFailed {
			return false
		}
	}
	return true
}
