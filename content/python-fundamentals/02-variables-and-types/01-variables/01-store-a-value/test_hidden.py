def test_creates_the_variable(source):
    assert "planet=" in source.replace(" ", "")


def test_print_line_is_unchanged(source):
    assert 'print("I would like to visit", planet)' in source
