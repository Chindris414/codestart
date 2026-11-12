def test_borders_are_twenty_equals_signs(run):
    lines = run().output.splitlines()
    assert lines[0] == "=" * 20
    assert lines[-1] == "=" * 20


def test_no_quotes_in_the_output(run):
    output = run().output
    assert '"' not in output and "'" not in output
