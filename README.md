# EL Studio — 퇴근 후에 켜지는 창문들

EL Studio(jeiel85)의 개발 포트폴리오입니다. 설명만 적는 대신, 레포와 스토어에서 가져온 실제 데이터(스크린샷, 언어 구성, 커밋·릴리스, CI, 배포 채널)를 한 페이지에 보여 줍니다.

- **사이트:** https://jeiel85.github.io
- **Google Play 개발자 페이지:** https://play.google.com/store/apps/dev?id=6375329746023339599

## 페이지 구성

| 영역 | 보여 주는 것 | 데이터 출처 |
| --- | --- | --- |
| 히어로 스카이라인 | 지난 1년 기여 기록. 창문 하나가 하루, 건물 하나가 한 달이고 건물 높이는 그 달의 기여량 | GitHub 기여 캘린더 |
| 대표작 | `featured: true` 프로젝트의 스크린샷, 설치 수, ★, 커밋, 릴리스, 언어 구성 | GitHub + Google Play |
| Play 스토어에서 받기 | 출시 앱(바로 설치)과 비공개 테스트 앱(테스터 그룹 가입 → 테스트 참여 → Play 설치 3단계 안내) | `apps.json` |
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
- **Play 새 앱 발견**: 빌드마다 [개발자 페이지](https://play.google.com/store/apps/dev?id=6375329746023339599)의 출시 앱 목록을 읽습니다. `apps.json`에 없는 앱은 `production`으로 추가하고(이름은 스토어 제목, 아이콘은 `icons/<패키지>.png`로 내려받음), 목록에 있는데 `closed_testing`·`github_only`인 앱은 `production`으로 올립니다. 추가된 앱에는 `githubUrl`이 없으므로 Actions 실행 요약의 경고(`New Play app added`)를 보고 `githubUrl`을 적고 `LOCKED_ANDROID_PACKAGES`에 등록합니다. 비공개 테스트 앱은 공개 목록에 없어 직접 추가해야 합니다. 개발자 페이지를 못 읽으면 경고만 남기고 발견 단계를 건너뜁니다.
- **비공개 테스트 설치 경로**: 비공개 테스트 앱마다 참여 링크(`https://play.google.com/apps/testing/<패키지>`)와 스토어 링크를 붙입니다. 방문자는 `developer.testerGroup` 그룹에 가입해야 참여할 수 있으므로, Play Console에서 각 비공개 테스트 트랙의 테스터를 **Google 그룹스 → 이 그룹**으로 지정해 두어야 합니다(이메일 목록 방식이면 초대받은 사람만 설치 가능).
- **실패 처리**: GitHub 또는 Play 호출이 실패하면 경고를 남기고 직전 캐시로 빌드합니다. 캐시도 없으면 해당 섹션만 빠집니다.
- **비공개 레포**: `apps.json`의 `githubUrl`이 공개 레포가 아니면 GitHub 버튼을 숨기고 빌드 로그에 경고를 남깁니다.

## 자동 배포

`.github/workflows/update-portfolio.yml`이 매일 오전 5시 47분(KST, 정각 혼잡을 피한 시각. GitHub 스케줄은 수십 분 이상 늦게 시작될 수 있음)과 `apps.json`·`scripts/**` 변경 시 빌드하고, 갱신된 `index.html`과 캐시를 커밋한 뒤 GitHub Pages로 배포합니다.

## 로컬 빌드

Node.js 22.12 이상이 필요합니다(`google-play-scraper` 10은 ES 모듈이라 `require`로 불러오려면 이 버전부터 됩니다). CI는 Node 24를 씁니다.

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
    "name": "EL Studio",
    "accountId": "6375329746023339599",
    "githubUsername": "jeiel85",
    "testerGroup": "sitdory-tester@googlegroups.com",
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
| `status` | Android: `production`(Play 출시) · `closed_testing`(비공개 테스트) · `github_only`. 그 외: `production`. Play Console의 실제 트랙과 맞춰 둡니다 |
| `optInUrl` | 비공개 테스트 참여 링크를 바꿀 때만 지정. 없으면 `https://play.google.com/apps/testing/<package>` |
| `githubUrl` | 연결할 레포. 공개 레포면 커밋·릴리스·스크린샷·언어가 자동으로 붙습니다 |
| `url` | 라이브 데모·소개 페이지. 없으면 레포의 homepage를 씁니다 |
| `featured` | 대표작 섹션에 크게 노출 |
| `description` | 직접 쓴 한 줄 설명. 없으면 Play 요약 → 레포 설명 순으로 씁니다 |
| `hidden` | 목록에서 숨김 |
| `developer.testerGroup` | 비공개 테스트 트랙에 연결한, 누구나 가입할 수 있는 Google 그룹 주소(`@googlegroups.com`). 페이지의 "그룹 가입하기" 링크가 됩니다 |
| `hiddenRepos` (최상위) | `apps.json`에 없는 공개 레포 중 목록에서 뺄 레포 이름 |

Android 패키지명은 `build.js`의 `LOCKED_ANDROID_PACKAGES`로 잠겨 있어, 등록된 패키지를 바꾸거나 지우면 빌드가 실패합니다.

## 브랜드 마크

`brand/`에 EL Studio 마크가 있습니다. 7×5 창문 격자에서 불 켜진 창문이 "EL"을 이룹니다(히어로 스카이라인과 같은 모티프).

| 파일 | 용도 |
| --- | --- |
| `brand/el-studio-mark.svg` | 원본. 파비콘(SVG)과 내비게이션 로고 |
| `brand/el-studio-mark-512.png` | 공유 미리보기(`og:image`)와 일반 용도 |
| `brand/el-studio-avatar-512.png` | GitHub 등 원형으로 잘리는 프로필 사진용(모서리 없는 정사각형, 여백 포함) |
| `brand/apple-touch-icon.png`, `favicon.png` | 180px 홈 화면 아이콘, 64px PNG 파비콘 |
| `brand/el-studio-play-header.png` | Google Play 개발자 페이지 헤더(4096×2304, 투명 없음). 2026-11 기준 기여 기록 스카이라인 |

## 기술

- 정적 HTML 한 장(프레임워크 없음), 바닐라 JS
- 폰트: Hahmlet(제목), IBM Plex Sans KR(본문), IBM Plex Mono(숫자)
- Node.js 빌드 스크립트, GitHub GraphQL API, `google-play-scraper` + 스토어 HTML 폴백
- GitHub Actions + GitHub Pages
