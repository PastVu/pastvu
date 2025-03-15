VERSION := $(shell node -p "require('./package.json').version")
BRANCH := $(shell git branch --show-current)
tag:
	git tag v$(VERSION)-$(BRANCH)
