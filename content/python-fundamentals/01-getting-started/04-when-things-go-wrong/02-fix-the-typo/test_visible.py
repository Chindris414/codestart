def test_prints_all_three_steps(run):
    assert run().output.splitlines() == [
        "Step 1: wake up",
        "Step 2: make tea",
        "Step 3: write some code",
    ]
