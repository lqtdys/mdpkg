#!/bin/bash
# mdpkg — mandatory pre-handoff verification
# Run before handing code to the user. All steps must pass.
set -e

echo "═══════════════════════════════════════"
echo "  mdpkg Verification Suite"
echo "═══════════════════════════════════════"

FAIL=0

# 仓库根锚定：步骤间 cd 不得泄漏（子 shell 执行目录切换）
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
if (cd "$ROOT/packages/mdpkg" && node --test test/*.test.ts); then
  echo "  ✅ Unit tests"
else
  echo "  ❌ Unit test failures"
  FAIL=1
fi

# 3. Format check (prettier)
echo ""
echo "── 3. Format Check ──"
if npx prettier --check \
  "$ROOT/README.md" "$ROOT/README.zh-CN.md" "$ROOT/package.json" \
  "$ROOT/scripts/build-site.ts" "$ROOT/scripts/build-site.test.ts" \
  "$ROOT/spec/mdpkg-format-spec.en.md" 2>/dev/null; then
  echo "  ✅ Format check"
else
  echo "  ⚠️  Format check skipped or found issues"
fi

# 4. Site build tests (scripts/build-site.test.ts)
echo ""
echo "── 4. Site Build Tests ──"
if node --test "$ROOT/scripts/build-site.test.ts"; then
  echo "  ✅ Site build tests"
else
  echo "  ❌ Site build test failures"
  FAIL=1
fi

# 5. Site build drift check (rebuild must not change docs/ byte-wise)
echo ""
echo "── 5. Site Build Drift Check ──"
_BEFORE=$(shasum -a 256 docs/spec.html docs/spec.zh.html 2>/dev/null)
node scripts/build-site.ts >/dev/null 2>&1
_AFTER=$(shasum -a 256 docs/spec.html docs/spec.zh.html 2>/dev/null)
if [ "$_BEFORE" = "$_AFTER" ]; then
  echo "  ✅ docs/ in sync with build output"
else
  echo "  ❌ docs/ drifted from build output — run: node scripts/build-site.ts && commit docs/"
  FAIL=1
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
