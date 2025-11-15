import { Bot, webhookCallback } from 'grammy/web';
import { registerHandlers } from './handlers/telegram.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Setup endpoint to configure webhook
    if (url.pathname === '/setup' && request.method === 'GET') {
      return handleSetup(request, env);
    }
    
    // Health check endpoint
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('Telegram Facebook Video Downloader Bot is running', { status: 200 });
    }
    
    // Only handle POST requests for webhook
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    // Webhook endpoint for Telegram (default path)
    try {
      // Create bot instance and register handlers
      const bot = new Bot(env.BOT_TOKEN, { 
        botInfo: env.BOT_INFO ? JSON.parse(env.BOT_INFO) : undefined 
      });
      registerHandlers(bot, env);
      
      // Create webhook handler and process request
      const handleUpdate = webhookCallback(bot, 'cloudflare-mod');
      return await handleUpdate(request);
    } catch (error) {
      console.error('Bot error:', error);
      return new Response('Error processing request: ' + error.message, { status: 500 });
    }
  }
};

async function handleSetup(request, env) {
  try {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const webhookUrl = baseUrl;
    
    // Call Telegram API to set webhook
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Webhook configured successfully',
        webhookUrl: webhookUrl,
        telegram_response: data
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: data.description || 'Failed to set webhook',
        telegram_response: data
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
