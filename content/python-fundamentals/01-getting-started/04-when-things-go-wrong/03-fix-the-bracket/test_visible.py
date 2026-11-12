def test_prints_both_lines(run):
    assert run().output.splitlines() == ["Errors are normal.", "I can fix them."]
