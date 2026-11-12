def test_prints_old_then_new_score(run):
    assert run().output.splitlines() == ["Score: 10", "Score: 25"]
