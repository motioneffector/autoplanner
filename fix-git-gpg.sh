#!/bin/bash
# Fix GitKraken's broken gpg.format setting
# Run this when git complains about "unsupported value for gpg.format"

git config --global --unset gpg.format 2>/dev/null || true
echo "Fixed gpg.format in ~/.gitconfig"
