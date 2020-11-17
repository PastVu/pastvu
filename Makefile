BRANCH:=	$(shell git branch --show-current)
ifeq ($(BRANCH),master)
TAG=latest
else
TAG=$(BRANCH)
endif
IMAGE=		pastvu/pastvu:$(TAG)

build:
	docker build -t $(IMAGE) .
push:
	docker push $(IMAGE)
test:
	docker-compose run app npm test
lintfix:
	docker-compose run app npm run lintfix
