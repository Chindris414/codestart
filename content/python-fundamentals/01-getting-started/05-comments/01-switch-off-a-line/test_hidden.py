def test_joke_line_is_commented_out_not_deleted(source):
    commented = [line for line in source.splitlines() if line.lstrip().startswith("#")]
    assert any("dinosaur" in line for line in commented)
