# Sitdory — 퇴근 후에 켜지는 창문들

Sitdory(jeiel85)의 개발 포트폴리오입니다. 설명만 적는 대신, 레포와 스토어에서 가져온 실제 데이터(스크린샷, 언어 구성, 커밋·릴리스, CI, 배포 채널)를 한 페이지에 보여 줍니다.

- **사이트:** https://jeiel85.github.io
- **Google Play 개발자 페이지:** https://play.google.com/store/apps/dev?id=6375329746023339599

## 페이지 구성

| 영역 | 보여 주는 것 | 데이터 출처 |
| --- | --- | --- |
| 히어로 스카이라인 | 지난 1년 기여 기록. 창문 하나가 하루, 건물 하나가 한 달이고 건물 높이는 그 달의 기여량 | GitHub 기여 캘린더 |
| 대표작 | `featured: true` 프로젝트의 스크린샷, 설치 수, ★, 커밋, 릴리스, 언어 구성 | GitHub + Google Play |
| 운영 | 배포 채널별 개수(Play 출시/비공개 테스트, Releases, 웹, CI), 월별 새 레포, 최근 활동 | GitHub + `apps.json` |
| 기술 | 언어별 코드 비중(바이트), 레포 토픽. 누르면 아래 목록이 그 기술로 필터링됨 | GitHub |
| 전체 프로젝트 | 공개 레포 전체 + `apps.json` 큐레이션. 검색·분류·채널·정렬, 카드를 누르면 상세(README 스크린샷 갤러리, 지표, 링크) | 전부 |

상세 창은 `#project/<레포이름>` 주소로 바로 열 수 있습니다(예: `https://jeiel85.github.io/#project/markleaf-android`).

## 데이터 파이프라인

```text
apps.json ──────────────┐
GitHub GraphQL ─────────┼─▶ scripts/build.js ─▶ index.html (정적 페이지 한 장)
Google Play 스토어 페이지 ┘        │
                                   ├─ scripts/github-cache.json  (GitHub 스냅샷)
                                   └─ scripts/cache.json         (Play 스토어 데이터)
```

- **GitHub (`scripts/github.js`)**: GraphQL 한 번의 페이지네이션으로 공개·비포크 레포 전체의 언어, 토픽, ★, 커밋 수, 릴리스, `.github/workflows` 개수, README 이미지(배지·로고·SVG 제외)와 첫 문단을 가져오고, 기여 캘린더를 따로 가져옵니다. **토큰이 필요합니다**(`GITHUB_TOKEN` 또는 `GH_TOKEN`).
- **Google Play**: 출시된 앱은 스토어 페이지에서 아이콘·요약·스크린샷·다운로드 수를 읽습니다. 비공개 테스트 앱은 스토어에 공개 페이지가 생기면 자동으로 `production`으로 승격됩니다.
- **실패 처리**: GitHub 또는 Play 호출이 실패하면 경고를 남기고 직전 캐시로 빌드합니다. 캐시도 없으면 해당 섹션만 빠집니다.
- **비공개 레포**: `apps.json`의 `githubUrl`이 공개 레포가 아니면 GitHub 버튼을 숨기고 빌드 로그에 경고를 남깁니다.

## 자동 배포

`.github/workflows/update-portfolio.yml`이 매일 오전 6시(KST)와 `apps.json`·`scripts/**` 변경 시 빌드하고, 갱신된 `index.html`과 캐시를 커밋한 뒤 GitHub Pages로 배포합니다.

## 로컬 빌드

Node.js 20 이상이 필요합니다.

```bash
cd scripts
npm install
GITHUB_TOKEN=$(gh auth token) node build.js
```

토큰 없이 실행하면 `github-cache.json`의 마지막 스냅샷으로 빌드합니다. 결과물은 루트의 `index.html`이며, 아무 정적 서버로 열면 됩니다(`python -m http.server`).

| 파일 | 역할 |
| --- | --- |
| `scripts/build.js` | 검증 → GitHub·Play 수집 → 모델 조립 → 렌더 |
| `scripts/github.js` | GitHub GraphQL 수집, README 이미지·발췌 추출, 캐시 |
| `scripts/render.js` | 정적 HTML 렌더(스카이라인 SVG 포함) |
| `scripts/styles.css`, `scripts/client.js` | 빌드 시 `index.html`에 인라인되는 스타일·스크립트(탐색기, 상세 창, 툴팁) |

## `apps.json` 관리

GitHub의 공개 레포는 `apps.json`에 없어도 전체 프로젝트 목록에 자동으로 나옵니다. `apps.json`은 **큐레이션**용입니다. 여기에 있는 프로젝트는 아이콘, 플랫폼, 배포 상태, 추천 순위를 직접 지정합니다.

```json
{
  "developer": {
    "name": "Sitdory",
    "accountId": "6375329746023339599",
    "githubUsername": "jeiel85",
    "description": "Android, Web & Desktop Developer",
    "tagline": "낮에는 9 to 6 직장인이자 두 아들의 아빠, 밤에는 ..."
  },
  "hiddenRepos": ["숨기고-싶은-레포"],
  "projects": [
    {
      "name": "Markleaf",
      "package": "com.markleaf.notes",
      "platform": "android",
      "status": "production",
      "featured": true,
      "githubUrl": "https://github.com/jeiel85/markleaf-android",
      "iconUrl": "icons/com.markleaf.notes.png"
    }
  ]
}
```

| 필드 | 설명 |
| --- | --- |
| `platform` | `android` · `web` · `desktop` |
| `status` | Android: `production`(Play 출시) · `closed_testing`(비공개 테스트) · `github_only`. 그 외: `production` |
| `githubUrl` | 연결할 레포. 공개 레포면 커밋·릴리스·스크린샷·언어가 자동으로 붙습니다 |
| `url` | 라이브 데모·소개 페이지. 없으면 레포의 homepage를 씁니다 |
| `featured` | 대표작 섹션에 크게 노출 |
| `description` | 직접 쓴 한 줄 설명. 없으면 Play 요약 → 레포 설명 순으로 씁니다 |
| `hidden` | 목록에서 숨김 |
| `hiddenRepos` (최상위) | `apps.json`에 없는 공개 레포 중 목록에서 뺄 레포 이름 |

Android 패키지명은 `build.js`의 `LOCKED_ANDROID_PACKAGES`로 잠겨 있어, 등록된 패키지를 바꾸거나 지우면 빌드가 실패합니다.

## 기술

- 정적 HTML 한 장(프레임워크 없음), 바닐라 JS
- 폰트: Hahmlet(제목), IBM Plex Sans KR(본문), IBM Plex Mono(숫자)
- Node.js 빌드 스크립트, GitHub GraphQL API, `google-play-scraper` + 스토어 HTML 폴백
- GitHub Actions + GitHub Pages
