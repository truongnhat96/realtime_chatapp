# Real-Time Chat Application Client

A professional, high-performance, real-time messaging and voice/video calling client. Built with **React 19**, **TypeScript (Strict)**, **Vite**, **Tailwind CSS v4**, **Zustand**, and **ASP.NET Core SignalR** for real-time events, integrated with **WebRTC** for peer-to-peer calling. Secured via a central OAuth2/OIDC Single Sign-On (SSO) authority.

---

## 🚀 Technologies & Libraries Used

### Core Stack
*   **Frontend Library:** [React 19](https://react.dev/) (Functional Components, Custom Hooks)
*   **Language:** [TypeScript](https://www.typescriptlang.org/) (Strict compilation: `noImplicitAny: true`, type-safe event payloads)
*   **Build Tool:** [Vite v8](https://vite.dev/) (Fast HMR & Optimized bundle splitting)
*   **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) (Fully customized utility-first styling with native CSS layer configuration)

### Real-Time & Networking
*   **Real-time Protocol:** [@microsoft/signalr](https://www.npmjs.com/package/@microsoft/signalr) (Robust WebSocket connection lifecycle management, automated retry, connection-pooling)
*   **P2P Communication:** [WebRTC](https://webrtc.org/) (Signaling via SignalR hub, secure peer-to-peer audio/video connection)
*   **API Client:** [Axios](https://axios-http.com/) (Interceptors for auth token injection, automatic token refresh, and session expiration handling)

### State Management
*   **Global State:** [Zustand v5](https://github.com/pmndrs/zustand) (Modular stores, persistent hydration, memory-efficient state updates)

### Authentication (SSO)
*   **OIDC Protocol:** [oidc-client-ts](https://github.com/authts/oidc-client-ts) & [react-oidc-context](https://github.com/authts/react-oidc-context) (Authorization Code Flow with PKCE, centralized authentication)

### UI/UX & Enhancements
*   **Icons:** [Lucide React](https://lucide.dev/) (Highly customizable vectors)
*   **Media Gallery:** [React Photo Album](https://react-photo-album.com/) & [Yet Another React Lightbox](https://yet-another-react-lightbox.com/) (Fluid image grids and fullscreen interactive viewer)
*   **Reactions & Emojis:** [Emoji-mart](https://github.com/missive/emoji-mart) (Rich picker and reaction support)

---

## ✨ Features

- 💬 **Real-time Messaging:** High-fidelity, instant message delivery, real-time typing indicators, read/seen receipt triggers, and message deletion support.
- 📞 **Voice & Video Calling:** Complete WebRTC-based call system with status tracking (ringing, active, ended, disconnected) and custom hardware toggles.
- 👥 **Group Chat Management:** Dynamic group creation, invitation links, customizable rules, and member controls (adding/removing participants, promoting permissions).
- 🏷️ **Reactions & Stickers:** Multiple reactions for message bubbles with summaries, dynamic emoji details modal, and sticker integration.
- 📂 **Rich File Attachments:** Support for images, videos, and custom files. Includes progress tracking, thumbnails, and modal galleries.
- 🔒 **SSO Integration:** Full authentication flow integrated with an external OAuth2/OIDC Authority, featuring automatic redirects on session expiration.
- 🌓 **Aesthetic Dark Mode:** Smooth switching between light and dark themes using CSS variables and Zustand persistence.
- 🕒 **GMT+7 Time Support:** Automatic client-side UTC timezone normalization into Vietnam Standard Time (GMT+7) for all timestamps.

---

## 📂 Project Architecture & Directory Layout

The application follows a modular, component-based architecture where business logic is separated from presentation components using custom hooks.

```
src/
├── assets/          # Static assets (images, logos, local background graphics)
├── components/      # UI components
│   ├── chat/        # Feature-specific components (ChatArea, Sidebar, CallWindow, ReactionPicker)
│   └── ui/          # Generic reusable UI primitives (button, input, toast, etc.)
├── hooks/           # Business logic & side effects
│   ├── useAuth.ts          # Centralized SSO auth handlers
│   ├── useChatHub.ts       # SignalR lifecycle (connect, reconnect, event bindings)
│   ├── useTypingIndicator.ts # Debounced typing indicator trigger
│   └── useMediaUpload.ts   # Media file uploading states & handlers
├── layouts/         # Layout components (AuthLayout wrapper)
├── lib/             # Configurations, helper utilities, and constants
│   ├── api.ts              # API endpoint registry
│   ├── axiosInstance.ts    # Custom Axios client with interceptors
│   └── constants.ts        # App configuration endpoints (SSO, Backend, Hub URL)
├── pages/           # High-level entry views & callback endpoints
│   ├── Login.tsx           # Entrance portal redirecting to OIDC SSO
│   ├── Chat.tsx            # Main chat interface wrapper
│   └── *Callback.tsx       # OAuth redirection handlers (Auth, Logout, JoinGroup)
├── stores/          # Zustand global state modules
│   ├── authStore.ts        # Session, tokens, and authorization state
│   ├── chatStore.ts        # Conversations, message lists, and participants
│   ├── callStore.ts        # WebRTC session status and media streams
│   └── themeStore.ts       # Theme preferences (Light / Dark mode)
└── types/           # Strict TypeScript contracts & event payload declarations
```

---

## 🛠️ Getting Started & Installation

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18.0.0 or above) installed on your system.

### 1. Clone & Install Dependencies
Navigate to the project root directory and execute:
```bash
npm install
```

### 2. Configure Environment & Endpoints
The configuration constants are located in `src/lib/constants.ts`. Adjust them according to your development environments:

```typescript
// src/lib/constants.ts
export const APP_CONFIG = {
  API_BASE_URL: 'https://localhost:7277/api/v1',          // ASP.NET Web API Endpoint
  HUB_URL: 'https://localhost:7277/chathub',              // SignalR Realtime Hub URL
  AUTH_STORAGE_KEY: 'auth-storage',

  // SSO / Authorization Server Details
  SSO_BASE_URL: 'https://localhost:7004',                 // SSO Authority Endpoint
  SSO_CLIENT_ID: 'chat-app',
  SSO_REDIRECT_URI: 'http://localhost:5173/auth-callback', // Callback URL after SSO success
  SSO_SCOPE: 'openid profile offline_access chat-api',
  SSO_TOKEN_URL: 'https://localhost:7004/connect/token',
  SSO_REFRESH_TOKEN_URL: 'https://localhost:7004/api/auth/token/refresh',
  SSO_LOGOUT_URL: 'https://localhost:7004/connect/logout',
  SSO_USER_PROFILE_URL: 'https://localhost:7004/api/user',
};
```

> [!NOTE]
> Since HTTP cookies (e.g., refresh token) are managed as `HttpOnly` by the backend BFF (Backend For Frontend) or authorization server, `automaticSilentRenew` is disabled within OIDC configuration settings to allow BFF-level renewals.

### 3. Run Development Server
To launch the client application locally with Hot Module Replacement (HMR):
```bash
npm run dev
```
By default, the server will listen on [http://localhost:5173](http://localhost:5173).

### 4. Build for Production
To generate a production-ready compiled bundle:
```bash
npm run build
```
To test and preview the production build locally:
```bash
npm run preview
```

---

## ⚡ SignalR connection & WebRTC Signaling Lifecycle

1.  **Authentication Handshake:** The SignalR connection is initialized inside [useChatHub.ts](file:///e:/Workspace/React/ChatApp_Client/src/hooks/useChatHub.ts) using the OIDC `accessTokenFactory` to authenticate connections securely.
2.  **Connection Management:**
    *   Exponential Backoff: When a connection drops, SignalR attempts to reconnect automatically in the background.
    *   State Reset: Active chat states and join references are cleaned up, then refetched once reconnection completes.
3.  **Clean Disconnections:** All event listeners (`ReceiveMessage`, `UserTyping`, `ReceiveCallSignal`, etc.) are unregistered dynamically during hook unmount cycles to prevent memory leaks.
4.  **WebRTC Signaling:** Call requests and session descriptors (SDP, ICE candidates) are routed via SignalR Hub connections, directly initializing the WebRTC peer-to-peer pipelines for local webcams and audio streams.
