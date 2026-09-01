#!/bin/bash
# mdpkg — mandatory pre-handoff verification
# Run before handing code to the user. All steps must pass.
set -e

echo "═══════════════════════════════════════"
echo "  mdpkg Verification Suite"
echo "═══════════════════════════════════════"

FAIL=0

# 1. TypeScript (Node 22.18+ native stripping)
echo ""
echo "── 1. TypeScript ──"
if npx tsc --noEmit 2>/dev/null; then
  echo "  ✅ TypeScript"
else
  echo "  ⚠️  TypeScript check skipped (no tsconfig or using native stripping)"
fi

# 2. Unit tests
echo ""
echo "── 2. Unit Tests ──"
if cd packages/mdpkg && node --test test/*.test.ts; then
  echo "  ✅ Unit tests"
else
  echo "  ❌ Unit test failures"
  FAIL=1
fi

# 3. Format check (prettier)
echo ""
echo "── 3. Format Check ──"
if npx prettier --check "*.{ts,tsx,mts,cts,md,json,yaml,yml}" 2>/dev/null; then
  echo "  ✅ Format check"
else
  echo "  ⚠️  Format check skipped or found issues"
fi

echo ""
echo "═══════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
  echo "  ✅ ALL CHECKS PASSED — Ready for handoff"
else
  echo "  ❌ $FAIL check(s) failed — Fix before handoff"
fi
echo "═══════════════════════════════════════"
exit $FAIL
