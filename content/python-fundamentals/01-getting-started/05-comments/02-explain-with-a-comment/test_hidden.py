def test_comment_says_something(source):
    first_line = source.strip().splitlines()[0]
    assert len(first_line.lstrip("#").strip()) >= 3
