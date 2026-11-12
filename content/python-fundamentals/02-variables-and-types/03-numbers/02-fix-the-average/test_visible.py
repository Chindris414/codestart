def test_prints_the_average(run):
    assert run().output.strip() == "7.0"
