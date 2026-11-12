def test_doubles_with_times_equals(source):
    assert source.count("*=") >= 3


def test_does_not_type_the_heights(source):
    lines = [line.replace(" ", "") for line in source.splitlines()]
    assert not any(line in ("height=4", "height=8", "height=16") for line in lines)
