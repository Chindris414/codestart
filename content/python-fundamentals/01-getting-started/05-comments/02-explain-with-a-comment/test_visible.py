def test_output_is_unchanged(run):
    assert run().output.splitlines() == ["OPEN", "Monday to Friday, 9 to 5"]


def test_starts_with_a_comment(source):
    first_line = source.strip().splitlines()[0]
    assert first_line.startswith("#")
