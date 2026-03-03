.PHONY: up down build rebuild logs ps restart clean

up:
	docker compose up --build

down:
	docker compose down

build:
	docker compose build

rebuild:
	docker compose down
	docker compose up --build

logs:
	docker compose logs -f

ps:
	docker compose ps

restart:
	docker compose restart

clean:
	docker compose down --volumes --remove-orphans
