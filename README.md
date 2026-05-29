# ChirpChat

ChirpChat is a production-oriented Expo chat client paired with a Node.js, Express, MongoDB, and Socket.IO backend. The app supports:

- Email/password registration, password reset OTP, and password change OTP
- Profile management with image uploads
- Friend requests and blocking
- Real-time chat with typing state, delivery status, read status, and file/image attachments
- Render-ready backend deployment and Expo/EAS mobile release flow

## Project structure

```text
.
├── app/                    Expo Router screens
├── components/             Shared UI components
├── constants/              Theme definitions
├── context/                Auth and theme providers
├── services/               API, socket, and storage helpers
└── server/                 Express + MongoDB + Socket.IO backend
```

## Local development

### 1. Install dependencies

```bash
npm install
npm --prefix server install
```

### 2. Configure environment variables

Client:

```bash
cp .env.example .env
```

Server:

```bash
cp server/.env.example server/.env
```

Set:

- `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SOCKET_URL` to your backend URL for production builds
- `MONGO_URI`, `AUTH_SECRET`, and your email provider settings in `server/.env`

### 3. Run the backend

```bash
npm run server:start
```

### 4. Run the Expo app

```bash
npm start
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run server:test
npm run check
```

## Render deployment

The repo includes [render.yaml](./render.yaml) and a `/health` endpoint for Render health checks.

Important production note:

- The backend stores uploaded files on disk.
- Render's default filesystem is ephemeral.
- Use the persistent disk configured in `render.yaml`, or uploads will disappear after redeploys/restarts.

Required backend environment variables:

- `MONGO_URI`
- `AUTH_SECRET`
- `CLIENT_ORIGIN`
- `PUBLIC_SERVER_URL`

Email delivery configuration:

- Recommended on Render free web services: set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`
- SMTP is still supported with `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`

Render note:

- Starting September 26, 2025, Render free web services block outbound SMTP traffic on ports `25`, `465`, and `587`
- If you stay on Render free, use an HTTPS email provider such as Resend for OTP delivery

## Expo / EAS release

The repo includes [eas.json](./eas.json) with `development`, `preview`, and `production` profiles.

Before your first store build:

1. Update `android.package` and `ios.bundleIdentifier` in [app.json](./app.json) if you need app-specific identifiers.
2. Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SOCKET_URL` for the production backend.
3. Run `eas login`.
4. Run `eas build:configure` if Expo asks to link the project.
5. Build with `eas build --platform android --profile production` and/or `eas build --platform ios --profile production`.

## Security and production notes

- Secrets are excluded from git with `.gitignore` and `.env.example` templates are provided instead.
- The backend now supports strict origin allowlisting, proxy-aware file URLs, health checks, file type filtering, and safer request limits.
- Uploads are kept out of source control except for `server/uploads/.gitkeep`.
