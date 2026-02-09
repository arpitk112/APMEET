# AP Meet

A real-time video conferencing application built with WebRTC, React, and Node.js.

## Overview

AP Meet is a video conferencing platform that supports high-quality video calls, screen sharing, and real-time chat. It's designed to provide a smooth meeting experience similar to Google Meet or Zoom.

### Features

- WebRTC-powered peer-to-peer video and audio streaming
- Real-time chat during video calls
- Screen sharing
- Multi-participant support with grid and spotlight views
- Responsive design for desktop and mobile devices
- Token-based user authentication
- Meeting history for registered users
- Modern UI built with Material-UI

## Tech Stack

**Frontend:**
- React 19
- Vite
- Material-UI (MUI)
- Socket.io Client
- React Router
- Axios

**Backend:**
- Node.js
- Express 5
- Socket.io
- MongoDB with Mongoose
- Token-based authentication with crypto
- bcrypt for password hashing

**WebRTC:**
- Google's public STUN server
- Peer-to-peer connections for direct media streaming
- ICE candidates for NAT traversal

## Installation

**Prerequisites:**
- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- npm or yarn

**Clone the Repository:**
```bash
git clone https://github.com/arpitk112/APMEET.git
cd APMEET
```

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file in the backend directory:
```env
MONGO_URI=your_mongodb_connection_string
PORT=8000
```

4. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment (if needed):
```javascript
// src/environment.js
const server = "http://localhost:8000"; // Update for production
export default server;
```

4. Start the development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Usage

**Starting a Meeting:**
1. Visit the home page
2. Register/Login (or join as a guest)
3. Generate a new meeting code or enter an existing one

**During a Meeting:**
- Toggle camera and microphone
- Share your screen
- Use the chat panel for messaging
- Click any video to enter spotlight mode (click again to return to grid view)
- End call when finished

## Architecture

### Project Structure

```
APMEET/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── socketManager.js    # WebRTC signaling
│   │   │   └── user.controller.js  # User operations
│   │   ├── models/
│   │   │   ├── user.model.js       # User schema
│   │   │   └── meeting.model.js    # Meeting schema
│   │   ├── routes/
│   │   │   └── user.routes.js      # API routes
│   │   └── app.js                  # Express app
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx     # Home page
│   │   │   ├── Authentication.jsx  # Login/Register
│   │   │   ├── Home.jsx            # Dashboard
│   │   │   ├── VideoMeet.jsx       # Main meeting room
│   │   │   └── History.jsx         # Meeting history
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # Auth state
│   │   ├── utils/
│   │   │   └── withAuth.jsx        # Auth HOC
│   │   ├── styles/                 # CSS modules
│   │   └── App.jsx
│   └── package.json
│
└── render.yaml                     # Deployment config
```

### Data Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Client A  │◄───────►│   Server    │◄───────►│   Client B  │
│   (React)   │         │  (Socket.io)│         │   (React)   │
└─────────────┘         └─────────────┘         └─────────────┘
      │                        │                        │
      │   WebRTC Signaling     │   WebRTC Signaling     │
      │◄──────────────────────►│◄──────────────────────►│
      │                                                  │
      │            Peer-to-Peer Media Stream            │
      │◄────────────────────────────────────────────────►│
```

### WebRTC Connection Flow

1. **User joins**: Socket.io connection established
2. **Signaling**: Exchange SDP offers/answers via server
3. **ICE candidates**: NAT traversal information exchanged
4. **Peer connection**: Direct P2P media stream established
5. **Media tracks**: Video/audio streams added to connection

## Authentication

The application uses token-based authentication. When users log in, a random token is generated using `crypto.randomBytes()` and stored in the MongoDB user document. This token is then used to authenticate subsequent requests. Protected routes verify the token to ensure users are authenticated before accessing features like meeting history.

## Deployment

### Render.com (Configured)

The project includes `render.yaml` for easy frontend deployment:

```yaml
services:
  - type: web
    name: videocall-frontend
    env: static
    buildCommand: cd frontend && npm install && npm run build
    staticPublishPath: ./frontend/dist
```

### Manual Deployment

**Backend**:
1. Deploy to Render, Heroku, Railway, or any Node.js hosting platform
2. Set environment variables:
   - `MONGO_URI`: Your MongoDB connection string
   - `PORT`: Server port (default: 8000)
3. Ensure WebSocket support is enabled for Socket.io
4. Configure CORS to allow your frontend domain

**Frontend**:
1. Update `src/environment.js` with your production backend URL
2. Build the project: `npm run build`
3. Deploy the `dist/` folder to:
   - Netlify (recommended for static sites)
   - Vercel
   - Render (using the included `render.yaml`)
   - Any static hosting service

**Important Notes**:
- Ensure HTTPS is enabled for WebRTC to work properly in production
- Configure proper STUN/TURN servers for production use
- Update CORS settings on backend to match your frontend domain

## Contributing

Contributions are welcome! Fork the repository, create a feature branch, make your changes, and open a pull request.

## Author

**Arpit Kumar**

- GitHub: [@arpitk112](https://github.com/arpitk112)
- Project: AP Meet - Real-Time Video Conferencing Platform


## Acknowledgments

Built with WebRTC, Socket.io, Material-UI, and Google's STUN servers.

## Future Enhancements

- Recording functionality
- Virtual backgrounds
- Breakout rooms
- Polls and reactions
- Calendar integration
- End-to-end encryption
