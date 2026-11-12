def test_prints_the_running_total(run):
    assert run().output.splitlines() == ["Morning: 1200", "Afternoon: 4700", "Evening: 5500"]
