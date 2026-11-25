package steps

import "testing"

func TestSceneConfigs(t *testing.T) {
	for n := 101; n <= 108; n++ {
		s := Get(n)
		if !s.Live || !s.Scene {
			t.Errorf("step %d: Live=%v Scene=%v, want both true", n, s.Live, s.Scene)
		}
	}
	if got := Get(105).CourierWaitMs; got != 6000 {
		t.Errorf("105 CourierWaitMs = %d, want 6000", got)
	}
	if got := Get(106).ScheduleToCloseMs; got != 12000 {
		t.Errorf("106 ScheduleToCloseMs = %d, want 12000", got)
	}
	if Get(2).Scene {
		t.Error("step 2 must not be a scene")
	}
}
