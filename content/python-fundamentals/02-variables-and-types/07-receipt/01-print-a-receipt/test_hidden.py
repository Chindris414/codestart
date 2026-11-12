def code_without_comments(source):
    return "\n".join(line.split("#")[0] for line in source.splitlines())


def test_keeps_the_starter_values(source):
    lines = [line.replace(" ", "") for line in source.splitlines()]
    for value in ["notebook_price=4", "pen_price=2", "notebooks=3", "pens=5", "paid=50"]:
        assert value in lines


def test_works_out_the_numbers(source):
    code = code_without_comments(source)
    for result in ["12", "10", "22", "28"]:
        assert result not in code


def test_repeats_the_dash_with_star(source):
    assert "-----" not in source
    assert "*" in code_without_comments(source)
