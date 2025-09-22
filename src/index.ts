import { DurableObject } from 'cloudflare:workers';

interface ChatMessage {
	message: string;
	name: string;
	timestamp?: number;
}

// Durable Object class
export class Chat extends DurableObject<Env> {
	async fetch(request: Request) {
		const url = new URL(request.url);
		return new Response('Not Found', { status: 404 });
	}
}

// Main Worker
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Get room name from URL parameters (creates separate chat rooms)
		const room = url.searchParams.get('room') || 'default';

		// Get Durable Object instance for this room
		// Each room gets its own isolated Durable Object with its own state
		const chatRoom = env.Chat.idFromName(room);
		const chat = env.Chat.get(chatRoom);

		// Forward request to the Durable Object
		return chat.fetch(request);
	},
};
