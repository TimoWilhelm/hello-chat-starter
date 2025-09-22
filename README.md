# Building Real-Time Chat with Cloudflare Durable Objects

## Workshop Overview

We'll kick off with a brief overview of the Cloudflare Developer Platform and Durable Objects, then dive into a hands-on session to build a real-time distributed chat application that runs globally on Cloudflare.

**What to bring:** Your laptop with your favorite code editor, a free Cloudflare account (can be created for free at <https://dash.cloudflare.com/sign-up>), and some JavaScript or TypeScript experience would be a plus.

## 🚀 A Step-by-Step Workshop

Welcome to this hands-on workshop where you'll build a real-time chat application from scratch using Cloudflare Durable Objects and Workers!

## 🎯 What You'll Build

By the end of this workshop, you'll have created:

- A **real-time chat application** that runs globally on Cloudflare's edge
- **Multi-room chat** with persistent message history
- **WebSocket-based** real-time communication
- **Serverless architecture** with state management

## ⏱️ Timeline Overview

- **Setup & Overview** - Project initialization
- **Frontend Walkthrough** - Creating the chat interface
- **Durable Object Basics** - Building the chat room
- **WebSocket Implementation** - Real-time messaging
- **Message Persistence** - Adding storage
- **Testing & Enhancement** - Testing and improvements

---

## 🏁 Step 1: Project Setup

You can use the following template to clone the template and deploy to your Cloudflare Account

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/TimoWilhelm/hello-chat-starter/tree/main/)

Alternatively, you can clone the template repository from GitHub:

```bash
git clone https://github.com/TimoWilhelm/hello-chat-starter.git
cd hello-chat-starter
```

### Install Dependencies

Run the following command to install dependencies:

```bash
npm install
```

**🎯 Test Point:** Run `npm run dev` and test the template runs successfully.

---

## 🏗️ Step 1: Durable Object Basics

Let's start building our backend! Create the basic structure in `src/index.ts`:

<!-- TODO: DO template, migrations -->

## 💬 Step 2: WebSocket Message Handling

Now let's add the core messaging functionality. Add these methods to your `Chat` class:

### Broadcast Messages

```typescript
// Broadcast message to all connected clients except sender
 private broadcast(data: ChatMessage, self: WebSocket) {
  // Get all WebSocket connections for this Durable Object
  for (const ws of this.ctx.getWebSockets()) {
   // Don't send message back to sender
   if (ws === self) continue;

   // Send message to other clients
   try {
    ws.send(JSON.stringify({ message: data.message, name: data.name, timestamp: data.timestamp }));
   } catch (error) {
    console.error('Error broadcasting to client:', error);
   }
  }
 }
 ```

### Accept Incoming WebSocket connections

```typescript
private async handleWebSocketUpgrade(request: Request, name: string) {
  // Create WebSocket pair
  const pair = new WebSocketPair();

  // Accept the WebSocket in the Durable Object
  this.ctx.acceptWebSocket(pair[0]);

  // Store user info with WebSocket
  pair[0].serializeAttachment({ name });

  // Notify others that someone joined
  this.broadcast({ message: 'joined the chat', name }, pair[0]);

  // Return the other end to client
  return new Response(null, { status: 101, webSocket: pair[1] });
 }
 ```

 Update the `fetch` handler to handle WebSocket upgrade requests:

 ```typescript
 async fetch(request: Request) {
  const url = new URL(request.url);

  // Check if this is a WebSocket upgrade request
  if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
   // Get username from URL parameters with validation
   const name = url.searchParams.get('name')?.trim() || 'Anonymous';
   return this.handleWebSocketUpgrade(request, name);
  }

  return new Response('Not Found', { status: 404 });
 }
 ```

### Handle Incoming Messages

```typescript
async webSocketMessage(ws: WebSocket, data: string) {
    try {
        const parsed = JSON.parse(data);
        const { message } = parsed;

        // Validate message
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return;
        }

        // Get user info
        const { name } = ws.deserializeAttachment();

        // Create message object
        const chatMessage: ChatMessage = {
            message: message.trim(),
            name,
            timestamp: Date.now()
        };

        // Broadcast to others
        this.broadcast(chatMessage, ws);

    } catch (error) {
        console.error('Error processing message:', error);
    }
}
```

### Handle Disconnections

```typescript
webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    try {
        const { name } = ws.deserializeAttachment();
        this.broadcast({ message: 'left the chat', name }, ws);
    } catch (error) {
        console.error('Error handling disconnect:', error);
    }
}

webSocketError(ws: WebSocket, error: unknown) {
    console.error('WebSocket error:', error);
}
```

**🎯 Test Point:** Your chat should now handle real-time messaging between users!

---

## 💾 Step 3: Message Persistence

Let's implement message history so new users can see previous messages:

### Update the sendChatHistory Method

Implement the `sendChatHistory` method to send chat history to a newly connected user:

```typescript
 private async sendChatHistory(ws: WebSocket) {
  // Get all stored messages (simplified from complex async iteration)
  const messages = this.ctx.storage.kv.list({ prefix: 'msg_' });

  // Send each message to the new user
  for (const [_, messageData] of messages) {
   const message = messageData as ChatMessage;
   ws.send(JSON.stringify({ message: message.message, name: message.name, timestamp: message.timestamp }));
  }
 }
```

Update the `handleWebSocketUpgrade` method to send chat history to the new user:

```typescript
 private async handleWebSocketUpgrade(request: Request, name: string) {
 ...

  await this.sendChatHistory(pair[0]); // <-- Send chat history to new user
  return new Response(null, { status: 101, webSocket: pair[1] });
 }
 ```

Update the `webSocketMessage` method to store messages in Durable Object storage:

```typescript
async webSocketMessage(ws: WebSocket, data: string) {
  ...

   const chatMessage: ChatMessage = {
    message: message.trim(),
    name,
    timestamp: Date.now(),
   };

   // Store message in Durable Object storage
   this.ctx.storage.kv.put(`msg_${chatMessage.timestamp}`, chatMessage); // <-- Store message in Durable Object storage

   this.broadcast(chatMessage, ws);
 }
```

### 🚀 Step 4: Deploy to Cloudflare

```bash
# Deploy your chat app
npm run deploy

# Your app will be available at:
# https://hello-chat.YOUR-SUBDOMAIN.workers.dev
```

---

## 🎉 Congratulations

You've successfully built a real-time chat application with:

- ✅ **Real-time messaging** with WebSockets
- ✅ **Multi-room support** with isolated state
- ✅ **Message persistence** across sessions
- ✅ **Global deployment** on Cloudflare's edge
- ✅ **Automatic scaling** with Durable Objects

## 🔧 Optional Enhancements (If Time Permits)

### Add User Count

Track online users in your Durable Object:

- Add a new storage key to store the online user count
- Broadcast the updated count to all connected clients in the WebSocket event handlers

## 📚 Key Concepts Learned

- **Durable Objects** provide consistent, stateful compute at the edge
- **WebSocket management** in serverless environments
- **Room-based architecture** with isolated state per object
- **Message persistence** with automatic storage APIs
- **Global deployment** with edge computing

## 🎯 Next Steps

- Explore [Cloudflare D1](https://developers.cloudflare.com/d1/) for more complex data needs
- Add [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/) for authentication
- Implement file sharing with [Cloudflare R2](https://developers.cloudflare.com/r2/)
- Add [Cloudflare Analytics](https://developers.cloudflare.com/analytics/) for insights

Great job building your real-time chat application! 🚀
