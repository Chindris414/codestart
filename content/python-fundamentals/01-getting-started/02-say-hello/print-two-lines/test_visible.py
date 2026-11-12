def test_prints_both_lines_in_order(run):
    lines = run().output.splitlines()
    assert lines == ["Hi, I'm learning Python.", "This is my second line of code."]
