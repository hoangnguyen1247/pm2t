CURRENT_BRANCH = $(git symbolic-ref HEAD | sed -e 's,.*/\(.*\),\1,')
CURREN_VERSION=$1
git add package.json
git add package-lock.json
git commit -m "chore: post release "$CURREN_VERSION
git push origin $CURRENT_BRANCH
