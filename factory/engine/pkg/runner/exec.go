package runner

import (
	"fmt"
	"os/exec"
)

// runVerifyCommand runs command through "sh -c" inside dir, returning an
// error if it exits non-zero.
func runVerifyCommand(dir, command string) error {
	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w: %s", err, out)
	}
	return nil
}
