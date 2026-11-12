def test_counts_down_then_go(run):
    assert run().output.splitlines() == ["3", "2", "1", "Go!"]
