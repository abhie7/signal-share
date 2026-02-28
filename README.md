# SignalShare

Direct peer-to-peer file transmission in your browser. 

SignalShare bypasses the cloud, establishing direct device-to-device data channels over your local network using WebRTC. When devices are remote, it falls back to an ephemeral memory relay. 

## Features

- Direct Local Transfer: Devices on the same network transfer files directly via WebRTC.
- Remote Relay Mode: Temporary server streams for remote peers with auto-deletion.
- Zero Storage: No databases, no hard drives used for file holding.
- Zero Accounts: No sign-ups, no OAuth, no tracking.
- Single Server Architecture: Frontend (Next.js) and Backend (Fastify + WebSockets) run cohesively in one process.

## Architecture

Client A <-> WebSocket Signaling <-> Fastify Server <-> WebSocket Signaling <-> Client B
Result: Client A <---> WebRTC DataChannel <---> Client B

- Signaling: WebSocket communication handled by Fastify for initial handshakes.
- P2P Transport: WebRTC data channels for maximum local throughput.
- Fallback Relay: If WebRTC fails, files stream through temporary Fastify memory maps.

## Tech Stack

- Frontend: Next.js 16, React 19, TailwindCSS 4, Framer Motion, Zustand
- Backend: Fastify, @fastify/websocket
- Languages: TypeScript throughout the full stack

## Getting Started

### Prerequisites

- Node.js (v20 or higher)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/abhie7/signal-share.git
   cd signal-share
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

### Production Build

1. Build the Next.js frontend:
   ```bash
   npm run build
   ```

2. Start the unified production server:
   ```bash
   npm start
   ```

## Project Structure

- `/app`: Next.js App Router containing pages, layouts, and SEO documentation.
- `/components`: React UI components including the scanner interface and share widgets.
- `/lib`: Client-side logic including Zustand stores and WebRTC connection handlers.
- `/hooks`: Custom React hooks for websocket events and device state management.
- `/server`: Fastify single-server implementation handling Websocket signaling and relay routing entirely separated from Next.js serverless functions.

## Privacy & Security

SignalShare is built as a transmission tool, not a data storage service.
- No permanent storage is used. Files are streamed in memory.
- Relay allocations automatically detonate after transmission.
- No analytics or behavioral tracking scripts are utilized.

## License

This project is open-sourced under the MIT License.
