def test_greets_the_world(run):
    assert run().output.strip() == "Hello, world!"
