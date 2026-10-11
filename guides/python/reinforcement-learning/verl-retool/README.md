# veRL ReTool Backend Benchmark

## Overview

This directory contains the benchmark script used by Cogbox's veRL guide.
`benchmark_tool_backends.py` compares Cogbox, Docker, and SandboxFusion
backends from a local veRL checkout with the `recipe` submodule initialized.
The Docker backend can also run standalone without a veRL checkout.

## Requirements

- A local veRL checkout with the `recipe` submodule initialized
- A Python environment where veRL is already installed
- Either `COGBOX_API_KEY` or `COGBOX_JWT_TOKEN` exported in your shell (for the Cogbox backend)

## Quick Start

From your veRL environment:

```bash
cd /path/to/cogbox/guides/python/reinforcement-learning/verl-retool
pip install -e .
```

Run the benchmark:

```bash
python benchmark_tool_backends.py \
  --backend cogbox \
  --verl-root /absolute/path/to/verl \
  --concurrency 1 4 8 16 32 64 128
```

The script runs `simple_stdout`, `cpu_bound_stdout`, and `runtime_error`,
and writes `summary.json` and `results.csv` under
`outputs/cogbox/<timestamp>/`.
