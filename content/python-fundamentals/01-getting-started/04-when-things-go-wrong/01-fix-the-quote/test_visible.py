def test_prints_the_greeting(run):
    assert run().output.strip() == "Good morning, world!"
