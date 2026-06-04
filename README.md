# 📱 Sitdory Developer Portfolio

Sitdory(jeiel85)의 개발 프로젝트들을 한눈에 확인하고 관리할 수 있는 현대적이고 아름다운 반응형 포트폴리오 웹사이트입니다.

이 프로젝트는 정적 HTML 파일(`index.html`)을 수동으로 유지보수하는 대신, **앱 데이터 자동 수집 스크립트**와 **GitHub Actions 워크플로우**를 활용하여 데이터와 디자인을 완벽히 분리하고 상시 최신 상태로 자동 갱신되도록 구축되었습니다.

## 🔗 웹사이트 주소
- **포트폴리오:** [https://jeiel85.github.io](https://jeiel85.github.io)
- **Google Play 개발자 페이지:** [https://play.google.com/store/apps/dev?id=6375329746023339599](https://play.google.com/store/apps/dev?id=6375329746023339599)

---

## ✨ 핵심 기능

1. **GitHub 공개 레포 자동 동기화**
   - 빌드 시 GitHub API로 공개/비포크 레포를 확인하고, 포트폴리오 후보에 해당하는 새 웹/데스크톱 프로젝트를 `apps.json`에 자동 병합합니다.
   - `-android` 레포는 패키지명과 Play Store 상태가 필요하므로 자동 중복 등록하지 않고, 기존 Android 앱 목록은 수동으로 정확히 관리합니다.

2. **Google Play Store 실시간 스크래핑 (`google-play-scraper` 활용)**
   - `apps.json`에 정의된 Android 앱 패키지명을 기반으로 구글 플레이 스토어에서 실시간 데이터를 자동으로 가져옵니다.
   - 앱 타이틀, 상세 설명, 다운로드 수, 별점(레이팅), 앱 아이콘 이미지 등을 자동으로 연동하여 렌더링합니다.

3. **프리미엄 & 반응형 UI 디자인 (Vanilla CSS & JS)**
   - 미려하고 매끄러운 다크 모드 테마와 글래스모피즘(Glassmorphism) 효과를 적용했습니다.
   - 배경에 부드럽게 유영하며 움직이는 애니메이션 오브(Background Glow Orbs)를 구현하여 시각적 몰입감을 줍니다.
   - 모바일, 태블릿, 데스크톱 등 어떠한 화면 크기에서도 최적의 레이아웃을 제공하는 완전 반응형 그리드를 채택했습니다.
   - 카테고리별(전체, Android, Web, Desktop) 클릭 시 부드러운 애니메이션과 함께 즉각 필터링되는 인터랙티브 기능을 탑재했습니다.

4. **GitHub Actions를 통한 100% 완전 자동화 배포**
   - 매일 한국 시간 기준 오전 6시(UTC 21:00)에 스케줄링된 크론탭 작업이 스크래퍼를 구동합니다.
   - 또는 프로젝트 구성 정보(`apps.json`)가 담긴 파일이 수정되어 `push`될 때 자동으로 빌드 파이프라인이 실행됩니다.
   - 빌드가 완료되면 최신 스토어 통계 및 데이터가 포함된 `index.html`이 자동 갱신 및 커밋되고, **GitHub Pages**를 통해 클라이언트에 즉시 무중단 배포됩니다.

---

## 📂 프로젝트 구조

```text
├── .github/
│   └── workflows/
│       └── update-portfolio.yml   # 매일 오전 6시 자동 빌드 및 GitHub Pages 배포 워크플로우
├── icons/                         # 웹/데스크톱 앱 아이콘 및 저장된 스토어 아이콘 폴더
├── scripts/
│   ├── build.js                   # apps.json 및 스토어 크롤링 데이터를 조합해 index.html을 빌드하는 핵심 스크립트
│   ├── cache.json                 # 플레이 스토어에서 긁어온 데이터 캐시 파일 (API 호출 최소화)
│   ├── package.json               # 빌드 디펜던시 (google-play-scraper 등)
│   └── package-lock.json
├── apps.json                      # 포트폴리오의 모든 데이터를 정의하는 단일 설정 소스 파일
├── index.html                     # build.js를 통해 갱신 및 자동 생성되는 빌드 결과물 (정적 페이지)
└── README.md                      # 본 설명 파일
```

---

## 🛠️ 로컬 개발 및 빌드 방법

로컬 환경에서 직접 수동으로 빌드하거나 테스트를 원할 경우 아래 단계를 따릅니다.

### 1. 요구사항
- [Node.js](https://nodejs.org/) (v20 이상 권장)

### 2. 패키지 설치
`scripts` 디렉토리로 이동하여 필요한 의존성 라이브러리를 설치합니다.
```bash
cd scripts
npm install
```

### 3. 빌드 실행
빌드 스크립트를 직접 노드로 실행하여 `index.html`을 빌드 및 갱신합니다.
```bash
node build.js
```
*스크립트가 정상 종료되면 루트 폴더의 `index.html`과 `scripts/cache.json`, 그리고 `icons/` 내부의 앱 아이콘 파일들이 자동으로 갱신됩니다.*

---

## 📝 포트폴리오 관리 가이드 (프로젝트 추가/수정)

포트폴리오의 모든 데이터(개발자 정보 및 프로젝트 목록)는 루트 디렉토리의 **`apps.json`** 파일 하나로 관리됩니다. 이 파일을 직접 수정할 수도 있고, 빌드 스크립트가 GitHub 공개 레포 중 새 웹/데스크톱 후보를 자동으로 추가할 수도 있습니다. GitHub Actions는 갱신된 `apps.json`, `index.html`, 캐시와 아이콘을 커밋한 뒤 배포합니다.

### `apps.json` 구조 예시

```json
{
  "developer": {
    "name": "Sitdory",
    "accountId": "6375329746023339599",
    "githubUsername": "jeiel85",
    "description": "Android, Web & Desktop Developer"
  },
  "projects": [
    {
      "name": "BrioDo — Do it with brio.",
      "package": "app.briodo",
      "platform": "android",
      "status": "production",
      "iconUrl": "icons/app.briodo.png"
    },
    {
      "name": "Score Fetcher — 찬양팀 콘티 & 악보 PWA",
      "platform": "web",
      "status": "production",
      "description": "예배 콘티 작성, 악보 검색, 통합 PDF 악보집 생성, 실시간 공유와 푸시 알림을 제공하는 스마트 찬양팀용 Progressive Web App (PWA).",
      "url": "https://score-fetcher.vercel.app",
      "githubUrl": "https://github.com/jeiel85/score-fetcher-web",
      "iconUrl": "icons/score-fetcher-web.png"
    }
  ]
}
```

### 💡 프로젝트 유형별 추가 가이드

#### 📱 Android 출시 앱 (Production)
구글 플레이 스토어에 라이브 상태인 앱의 경우, `package` 필드에 정확한 패키지명을 적어주면 빌드 시 자동으로 설명, 아이콘, 다운로드 수, 평점을 스토어로부터 긁어옵니다.
```json
{
  "name": "앱 이름",
  "package": "com.example.myapp",
  "platform": "android",
  "status": "production",
  "iconUrl": "icons/com.example.myapp.png"
}
```

#### 🧪 Android 비공개 테스트 앱 (Closed Testing)
비공개 테스트 중인 앱의 경우 `status`를 `closed_testing`으로 선언하면 테스터 전용 가입 링크(Join Beta)와 플레이 스토어 이동 버튼이 세련된 오렌지색 배지와 함께 제공됩니다.
```json
{
  "name": "테스트 앱 이름",
  "package": "com.example.testapp",
  "platform": "android",
  "status": "closed_testing",
  "iconUrl": "icons/com.example.testapp.png"
}
```

#### 🌐 Web 및 💻 Desktop 프로젝트
웹/데스크톱 앱은 스토어 스크래핑을 탈 수 없으므로 `description`, `url`(또는 다운로드 링크), `githubUrl` 등을 직접 정적으로 적어줍니다.
```json
{
  "name": "LocalPDF Studio",
  "platform": "desktop",
  "status": "production",
  "description": "Tauri + Rust 기반의 현대적인 로컬 PDF 편집 및 변환 프로그램.",
  "githubUrl": "https://github.com/jeiel85/localpdf-studio-desktop",
  "iconUrl": "icons/localpdf-studio-desktop.png"
}
```

---

## 🎨 기술 스택 및 디자인 요소
- **Frontend Core:** HTML5, CSS3 (Custom Variables, Flexbox, CSS Grid), Vanilla Javascript (ES6+)
- **Build & Automation:** Node.js, `google-play-scraper`
- **CI/CD Pipeline:** GitHub Actions & GitHub Pages
- **Typography:** Google Fonts (Inter)
- **Visual Badges:** Shields.io
