package controller

import "testing"

func TestSetStepResetsScene(t *testing.T) {
	c, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	c.build = "bad"
	c.idemKey = false
	c.resetSceneLocked()
	if c.build != "good" || !c.idemKey {
		t.Fatalf("build=%q idemKey=%v, want good/true", c.build, c.idemKey)
	}
}
