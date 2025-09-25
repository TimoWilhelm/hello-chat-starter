# Adding Managed Rate Limiting to Your Chat App

## Follow-Up Workshop Overview

**Prerequisites:** You should have completed the main chat application workshop and have a working real-time chat app running on Cloudflare Workers with Durable Objects.

## 🎯 What You'll Add

In this follow-up workshop, you'll enhance your chat application with rate limiting capabilities:

- **Managed Rate Limiting** using Cloudflare Rate Limiting API
- **Per-user rate limits** to prevent spam and abuse
- **Unique user identification** with WebSocket attachments
- **Automatic rate limit enforcement** with user-friendly error messages
- **Production-ready spam protection** for your chat application

---

## 🛡️ Step 1: Configure Cloudflare Rate Limiting

### Understanding Managed Rate Limiting

**Cloudflare Rate Limiting** provides managed rate limiting capabilities that allow you to:

- Set limits on requests per user or IP address
- Configure time windows for rate limiting
- Automatically block or throttle excessive requests
- Protect your application from spam and abuse
- Scale rate limiting globally without managing state

### Add Rate Limit Binding to Configuration

First, we need to configure the rate limiting binding in your `wrangler.jsonc` file. This will give your Worker access to Cloudflare's managed rate limiting service.

Update your `wrangler.jsonc` file by adding the rate limits configuration:

```jsonc
/**
 * For more details on how to configure Wrangler, refer to:
 * https://developers.cloudflare.com/workers/wrangler/configuration/
 */
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "hello-chat",
  "main": "src/index.ts",
  "compatibility_date": "2025-09-12",
  "observability": {
    "enabled": true
  },
  "ai": {
    "binding": "AI"
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "Chat",
        "class_name": "Chat"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["Chat"]
    }
  ],
  "ratelimits": [
    {
      "name": "RATELIMIT",
      "namespace_id": "999",
      "simple": {
        "limit": 3,
        "period": 10
      }
    }
  ],
  "assets": {
    "directory": "./public/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

### Rate Limit Configuration Explained

- **name**: `"RATELIMIT"` - The binding name you'll use in your code
- **namespace_id**: `"999"` - Unique identifier for your rate limit configuration
- **simple**: Basic rate limiting configuration
  - **limit**: `3` - Maximum number of requests allowed
  - **period**: `10` - Time period in seconds (3 requests per 10 seconds)

**🎯 Test Point:** Save your `wrangler.jsonc` file with the new rate limiting configuration.

---

## 🔧 Step 2: Generate TypeScript Types

### Automatic Type Generation

Wrangler can automatically generate TypeScript types for your bindings, including the new rate limiting binding. This ensures type safety when working with Cloudflare's Rate Limiting API.

Run the following command to generate updated types:

```bash
npm run cf-typegen
```

This command will update your `worker-configuration.d.ts` file to include the new rate limiting binding types, giving you intellisense and type checking for the Rate Limiting API.

**🎯 Test Point:** Verify that your `worker-configuration.d.ts` file has been updated with rate limiting binding types.

---

## 🔐 Step 3: Add Unique User Identification

### Understanding User Identification for Rate Limiting

To implement effective per-user rate limiting, we need to assign a unique identifier to each WebSocket connection. This identifier will be used as the rate limiting key to track requests per user.

### Update WebSocket Attachment with Unique ID

Modify your existing `handleWebSocketUpgrade` method in the `Chat` class to include a unique ID for each user:

```typescript
private async handleWebSocketUpgrade(request: Request, name: string) {
    // Create WebSocket pair
    const pair = new WebSocketPair();

    // Accept the WebSocket in the Durable Object
    this.ctx.acceptWebSocket(pair[0]);

    // Store user info with WebSocket
    pair[0].serializeAttachment({ name, id: crypto.randomUUID() }); // <- Now includes unique I>

    // Notify others that someone joined
    this.broadcast({ message: 'joined the chat', name }, pair[0]);

    // Send chat history to new user
    await this.sendChatHistory(pair[0]);

    // Return the other end to client
    return new Response(null, { status: 101, webSocket: pair[1] });
}
```

### Key Changes Explained

1. **Unique ID Generation**: `crypto.randomUUID()` generates a unique identifier for each WebSocket connection
2. **Enhanced Attachment**: The WebSocket attachment now stores both `name` and `id`
3. **Per-User Tracking**: Each user gets a unique rate limiting key regardless of their display name

**🎯 Test Point:** Your WebSocket connections now have unique identifiers for rate limiting purposes.

---

## ⚡ Step 4: Implement Rate Limit Checking

### Understanding Rate Limit Integration

Now we'll modify your existing `webSocketMessage` function to check rate limits before processing messages. This prevents spam and ensures fair usage of your chat application.

### Update the WebSocket Message Handler

Update your current `webSocketMessage` method in the `Chat` class to include rate limit checking:

```typescript
async webSocketMessage(ws: WebSocket, data: string) {
    try {
        const parsed = JSON.parse(data);
        const { message } = parsed;

        // Validate message content
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return; // Ignore empty messages
        }

        // Get user info from WebSocket attachment
        const { name, id } = ws.deserializeAttachment();

        // Check rate limit using the unique user ID
        const outcome = await this.env.RATELIMIT.limit({ key: id });

        if (!outcome.success) {
            ws.send(
                JSON.stringify({
                    message: 'Rate limit exceeded. Please try again later.',
                    name: 'System',
                })
            );
            return;
        }

        // Create message object with timestamp
        const chatMessage: ChatMessage = {
            message: message.trim(),
            name,
            timestamp: Date.now(),
        };

        // Store message in Durable Object storage
        this.ctx.storage.kv.put(`msg_${chatMessage.timestamp}`, chatMessage);

        // Broadcast to all OTHER connected clients (not sender)
        this.broadcast(chatMessage, ws);

        // Check if this is an emoji generation request
        if (chatMessage.message.startsWith('emoji:')) {
            const { response } = await this.env.AI.run('@cf/meta/llama-3-8b-instruct-awq', {
                prompt: `Generate a single emoji character based on the following text: ${message}`,
            });

            const emojiMessage: ChatMessage = {
                message: response ?? '🤔',
                name: 'AI',
                timestamp: Date.now(),
            };

            // Store AI message in Durable Object storage
            this.ctx.storage.kv.put(`msg_${emojiMessage.timestamp}`, emojiMessage);

            // Broadcast AI response to all connected clients
            this.broadcast(emojiMessage);
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
}
```

### Key Implementation Details

1. **Rate Limit Check**: `await this.env.RATELIMIT.limit({ key: id })` checks if the user has exceeded their limit
2. **User-Specific Keys**: Each user's unique ID is used as the rate limiting key
3. **Graceful Handling**: Users who exceed the limit receive a polite system message
4. **Early Return**: Rate-limited requests are blocked before processing or storage
5. **Preserved Functionality**: All existing features (AI, storage, broadcasting) remain intact

### Rate Limit Response Handling

- **Success**: `outcome.success = true` - Message is processed normally
- **Rate Limited**: `outcome.success = false` - User receives a system warning message
- **Automatic Reset**: Rate limits automatically reset after the configured time period

**🎯 Test Point:** Your chat app now enforces rate limits! Users can only send 3 messages every 10 seconds.

---

## 🎮 Step 5: Test Your Rate Limiting

### Testing Rate Limit Enforcement

1. **Start your development server**:

   ```bash
   npm run dev
   ```

2. **Open your chat application** in a browser tab

3. **Test rate limiting behavior**:
   - Send 3 messages quickly (should work normally)
   - Try to send a 4th message immediately (should be rate limited)
   - Wait 10 seconds and try again (should work again)

4. **Test multi-user scenarios**:
   - Open multiple browser tabs with different usernames
   - Verify that rate limits are applied per user, not globally

### Expected Behavior

- **Normal Usage**: Users can send up to 3 messages every 10 seconds
- **Rate Limited**: Excessive users see: `"Rate limit exceeded. Please try again later."`
- **System Messages**: Rate limit warnings appear as "System" messages
- **Independent Users**: Each user has their own rate limit quota

### Example Test Sequence

1. **User "Alice"** sends 3 messages → ✅ All delivered
2. **User "Alice"** sends 4th message → ❌ Rate limited
3. **User "Bob"** sends 1st message → ✅ Delivered (independent limit)
4. Wait 10 seconds
5. **User "Alice"** sends message → ✅ Delivered (limit reset)

**🎯 Test Point:** Verify that rate limiting works correctly and provides clear feedback to users.

---

## 🚀 Step 6: Deploy with Rate Limiting

### Deploy to Production

Deploy your rate-limited chat app to Cloudflare:

```bash
# Deploy your rate-limited chat app
npm run deploy

# Your app will be available at:
# https://hello-chat.YOUR-SUBDOMAIN.workers.dev
```

### Production Considerations

- **Rate Limit Tuning**: Adjust `limit` and `period` values based on your use case
- **Monitoring**: Monitor rate limiting metrics in the Cloudflare dashboard
- **User Experience**: Consider showing users their remaining quota
- **Abuse Prevention**: Rate limiting helps prevent spam and ensures fair usage

**🎯 Test Point:** Your production chat application now has robust rate limiting protection!

---

## 🎉 Congratulations

You've successfully added managed rate limiting to your chat application:

- ✅ **Rate Limiting Configuration** with Cloudflare's managed service
- ✅ **Per-User Limits** using unique WebSocket identifiers
- ✅ **Automatic Enforcement** with user-friendly error messages
- ✅ **Spam Protection** to maintain chat quality
- ✅ **Global Rate Limiting** managed at Cloudflare's edge


## 📚 Key Rate Limiting Concepts Learned

- **Managed Rate Limiting** with Cloudflare's edge infrastructure
- **Per-User Identification** using unique WebSocket identifiers
- **Graceful Degradation** with user-friendly error messages
- **Spam Prevention** to maintain application quality
- **Global Rate Limiting** with automatic scaling and management

## 🔗 Additional Resources

- [Cloudflare Rate Limiting Documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Rate Limiting Best Practices](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/rate-limiting-guidance/)
- [WebSocket Rate Limiting Patterns](https://developers.cloudflare.com/durable-objects/examples/websocket-rate-limiting/)

Great job adding production-ready rate limiting to your real-time chat application! 🛡️🚀
