def test_prints_the_banner(run):
    assert run().output.splitlines() == [
        "--------------------",
        "Welcome to the club",
        "--------------------",
    ]
