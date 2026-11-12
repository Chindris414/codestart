def test_prints_minutes_and_seconds(run):
    assert run().output.strip() == "3 minutes and 20 seconds"
