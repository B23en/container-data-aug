# Docker Compose FE/BE/DB 구성 계획

## 구성 요약

이 프로젝트의 Docker Compose 서비스는 `frontend`, `backend`, `postgres`로 고정한다. 별도 worker나 DE 서비스는 만들지 않고, 이미지 증강 및 OCR 실행은 현재 FastAPI 백엔드 안에서 수행한다.

기본 compose는 배포/일반 실행용 전체 스택이다. 개발용 핫리로드 설정은 `docker-compose.dev.yml`, GPU 런타임 설정은 `docker-compose.gpu.yml`에서 override로 얹는다.

## 실행 명령

기본/배포용 전체 스택:

```powershell
docker compose up --build
```

개발용 핫리로드 스택:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

GPU 런타임 포함 스택:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

GPU 구성은 NVIDIA Container Toolkit이 준비된 환경에서만 실제 모델 실행까지 검증할 수 있다.

## 접속과 포트

- 기본 외부 진입점은 proxy 하나이며, `APP_PORT` 기본값은 `3000`이다.
- `http://localhost:3000/`는 frontend로 전달된다.
- `/api`, `/docs`, `/redoc`, `/openapi.json`은 backend로 전달된다.
- Postgres `5432`와 backend `8000`은 개발 override에서만 호스트에 노출된다.

## 데이터셋 경로 규칙

브라우저 업로드는 사용하지 않는다. 대량 데이터셋은 호스트 폴더를 백엔드 컨테이너에 마운트해서 처리한다.

기본 마운트:

```text
호스트: ./shared/data
컨테이너: /data
```

프로젝트 생성 시 입력 예시:

```text
/data/my-dataset
```

증강 결과 폴더 예시:

```text
컨테이너: /data/my-dataset-augmented
호스트: ./shared/data/my-dataset-augmented
```

마운트할 호스트 폴더를 바꾸고 싶으면 `.env`에 `DATASET_ROOT`를 지정한다.

## 환경 변수

`.env.compose.example`을 참고해 `.env`를 만들 수 있다. 현재 계획에서는 DB 계정 기본값을 compose 파일에 유지한다.

주요 값:

```text
APP_PORT=3000
DATASET_ROOT=./shared/data
POSTGRES_USER=myuser
POSTGRES_PASSWORD=mypassword
POSTGRES_DB=mydatabase
NEXT_PUBLIC_API_BASE_URL=/api
```

## Docker 모드 UX

Docker compose로 실행된 frontend는 `NEXT_PUBLIC_DOCKER_MODE=true`로 빌드된다.

- 프로젝트 생성 화면에서는 OS 폴더 선택 버튼 대신 `/data/...` 경로를 직접 입력한다.
- 결과 화면에서는 호스트 폴더 열기 버튼 대신 컨테이너 결과 경로와 호스트 기준 `./shared/data/...` 경로를 보여준다.
- 로컬에서 frontend/backend를 직접 실행하는 기존 방식은 폴더 선택/열기 API를 계속 사용할 수 있다.

## 검증 항목

- `docker compose config`
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml config`
- `docker compose -f docker-compose.yml -f docker-compose.gpu.yml config`
- backend 테스트: `uv run pytest`
- frontend lint: `pnpm lint` 또는 로컬 `node_modules`의 eslint
- frontend production build: `pnpm build`
