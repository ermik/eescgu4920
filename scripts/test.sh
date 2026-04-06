#!/usr/bin/env bash
set -e
for f in $(find src -name '*.test.ts'); do
  echo "--- Running $f ---"
  npx tsx "$f"
done
echo "=== All test files passed ==="
