def test_prints_the_answer(run):
    assert run().output.strip() == "42"
