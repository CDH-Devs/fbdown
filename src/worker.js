/**
 * src/index.js
 * Final Code V48 (Prioritizes Open Graph 'og:image' meta tag to find the true thumbnail URL)
 * Developer: @chamoddeshan
 */

// *****************************************************************
// ********** [ 1. Configurations and Constants ] ********************
// *****************************************************************
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
// *****************************************************************

// Telegram API Base URL
const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Helper Functions ---

function htmlBold(text) {
    return `<b>${text}</b>`;
}

// *****************************************************************
// ********** [ 2. WorkerHandlers Class (Simplified for Test) ] *******
// *****************************************************************

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
    }
    
    // --- Telegram API Helpers (Minimum required functions) ---

    async sendMessage(chatId, text, replyToMessageId) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'HTML', 
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                console.error(`sendMessage API Failed (Chat ID: ${chatId}):`, result);
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            console.error(`sendMessage Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    // --- sendPhoto (Thumbnail Test Function) ---
    async sendPhoto(chatId, photoUrl, replyToMessageId) { 
        try {
            console.log(`[TEST] Attempting to send photo from URL: ${photoUrl.substring(0, 50)}...`);
            const response = await fetch(`${telegramApi}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    photo: photoUrl, // Direct URL to the photo
                    reply_to_message_id: replyToMessageId,
                    caption: htmlBold("✅ Thumbnail Test Successful!"),
                    parse_mode: 'HTML',
                }),
            });
            const result = await response.json();
            if (response.ok) {
                console.log("[TEST] sendPhoto successful.");
                return result.result.message_id; 
            }
            // Log full error for debugging
            console.error(`[TEST] sendPhoto API Failed (Chat ID: ${chatId}):`, result);
            return null;
        } catch (e) {
            console.error(`[TEST] sendPhoto Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }
}


// *****************************************************************
// ********** [ 3. Main Fetch Handler (Simplified Logic) ] ***********
// *****************************************************************

export default {
    
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        const handlers = new WorkerHandlers(env);
        
        try {
            const update = await request.json();
            const message = update.message;
            
            if (!message) {
                 return new Response('OK', { status: 200 });
            }

            const chatId = message.chat.id;
            const messageId = message.message_id;
            const text = message.text ? message.text.trim() : null; 
            
            const userName = message.from.first_name || "User"; 

            // --- A. /start command Handling ---
            if (text && text.toLowerCase().startsWith('/start')) {
                const userText = `👋 <b>Hello Dear ${userName}!</b> 💁‍♂️ This Bot is currently in <b>Thumbnail Testing Mode</b>.
                
                Please send a Facebook Video link to test the thumbnail functionality.`;
                await handlers.sendMessage(chatId, userText, messageId);
                return new Response('OK', { status: 200 });
            }

            // --- B. Facebook Link Handling (Thumbnail Test Only) ---
            if (text) { 
                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    
                    // Initial Acknowledgement Message
                    const initialMessage = await handlers.sendMessage(
                        chatId, 
                        htmlBold('⏳ Thumbnail Link එක සොයමින්...'), 
                        messageId
                    );
                    
                    try {
                        const fdownUrl = "https://fdown.net/download.php";
                        const formData = new URLSearchParams();
                        formData.append('URLz', text); 
                        
                        // 1. Scraping FDown for Links
                        const fdownResponse = await fetch(fdownUrl, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fdown.net/', 
                            },
                            body: formData.toString(),
                            redirect: 'follow' 
                        });
                        
                        // --- Console Logging: FDown Response Check ---
                        console.log(`[DEBUG] FDown Fetch Status: ${fdownResponse.status}, OK: ${fdownResponse.ok}`);
                        if (!fdownResponse.ok) {
                            throw new Error(`FDown fetch failed with status ${fdownResponse.status}`);
                        }
                        
                        const resultHtml = await fdownResponse.text();
                        let rawThumbnailLink = null;
                        
                        // 2. Get Thumbnail Link
                        // V48 FIX: Prioritize Open Graph (OG) meta tag (most reliable)
                        const ogImageRegex = /<meta[^>]+property=["']?og:image["']?[^>]*content=["']?([^"'\s]+)["']?/i;
                        let thumbnailMatch = resultHtml.match(ogImageRegex);

                        if (thumbnailMatch && thumbnailMatch[1]) {
                            // If OG image found, use it directly (it's always an absolute URL)
                            rawThumbnailLink = thumbnailMatch[1].replace(/&amp;/g, '&');
                            console.log(`[DEBUG] Thumbnail Found: OG Meta Tag`);
                        } else {
                            // Secondary Check: Fallback to the style-based image tag (V45/V46 logic)
                            console.log(`[DEBUG] Thumbnail Not Found in OG Tag. Falling back to <img> tag.`);
                            const fallbackRegex = /<img[^>]+style=["']?width:100%;max-height:240px;["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                            thumbnailMatch = resultHtml.match(fallbackRegex);
                            
                            if (thumbnailMatch && thumbnailMatch[1]) {
                                let tempLink = thumbnailMatch[1].replace(/&amp;/g, '&'); 
                                rawThumbnailLink = tempLink;
                                console.log(`[DEBUG] Thumbnail Found: Fallback <img> Tag`);
                            }
                        }
                        
                        // Process the final link
                        if (rawThumbnailLink) {
                            let finalLink = rawThumbnailLink;
                            console.log(`[DEBUG] Raw Thumbnail URL: ${finalLink}`);

                            // V47 FIX (Re-applied for safety): Ensure the link is absolute if it's a relative path like img/
                            if (finalLink.startsWith('img/') || (finalLink.startsWith('/') && !finalLink.startsWith('//'))) {
                                // Assume 'https://fdown.net/' is the base URL
                                rawThumbnailLink = 'https://fdown.net/' + finalLink.replace(/^\//, ''); // Remove leading slash if present
                                console.log(`[DEBUG] V47 FIX: Applied FDown prefix.`);
                            } else {
                                rawThumbnailLink = finalLink;
                            }
                        }
                        
                        console.log(`[DEBUG] Final Thumbnail Link: ${rawThumbnailLink}`);

                        // 3. (Optional) Check Video Links (Kept for full HTML analysis in Console Log)
                        let videoUrl = null;
                        const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
                        let match = resultHtml.match(hdLinkRegex);
                        
                        if (match && match[1]) {
                            videoUrl = match[1].replace(/&amp;/g, '&'); 
                            console.log(`[DEBUG] Video Link Type: HD, URL: ${videoUrl.substring(0, 50)}...`);
                        } else {
                            const normalLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
                            match = resultHtml.match(normalLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1].replace(/&amp;/g, '&'); 
                                console.log(`[DEBUG] Video Link Type: Normal, URL: ${videoUrl.substring(0, 50)}...`);
                            } else {
                                console.log("[DEBUG] Video Links not found.");
                            }
                        }

                        // 4. Send Photo or Error
                        if (rawThumbnailLink && !rawThumbnailLink.endsWith('no-thumbnail-fndown.png')) {
                            
                            const photoMessageId = await handlers.sendPhoto(
                                chatId, 
                                rawThumbnailLink, 
                                messageId // Reply to user's original message
                            );
                            
                            if (photoMessageId) {
                                // Delete the temporary acknowledgement message
                                if (initialMessage) {
                                     handlers.deleteMessage(chatId, initialMessage);
                                }
                                console.log("[TEST] Thumbnail sent successfully and temporary message deleted.");
                            } else {
                                await handlers.sendMessage(chatId, htmlBold('❌ Thumbnail එක යැවීම අසාර්ථක විය. Link එක වැඩ කරන්නේ නැහැ.'), messageId);
                            }
                            
                        } else {
                            // Error: Link not found OR Default No-Thumbnail Image Found
                            if (rawThumbnailLink && rawThumbnailLink.endsWith('no-thumbnail-fndown.png')) {
                                console.error(`[TEST] Thumbnail Link found, but it is the default error image.`);
                            } else {
                                console.error(`[TEST] Thumbnail Link not found for: ${text}`);
                            }
                            
                            const errorText = htmlBold('⚠️ සමාවෙන්න, Thumbnail Link එක සොයා ගැනීමට නොහැකි විය.');
                            if (initialMessage) {
                                 // Reply to the initial message with the error (if it exists)
                                 await handlers.sendMessage(chatId, errorText, initialMessage); 
                            } else {
                                 await handlers.sendMessage(chatId, errorText, messageId);
                            }
                        }
                        
                    } catch (fdownError) {
                         console.error(`[TEST] FDown Scraping Error (Chat ID: ${chatId}):`, fdownError);
                         const errorText = htmlBold('❌ Scraping ක්‍රියාවලියේ දෝෂයක් ඇති විය.');
                         if (initialMessage) {
                             // Reply to the initial message with the error
                             await handlers.sendMessage(chatId, errorText, initialMessage);
                         } else {
                             await handlers.sendMessage(chatId, errorText, messageId);
                         }
                    }
                    
                } else {
                    await handlers.sendMessage(chatId, htmlBold('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), messageId);
                }
            } 
            
            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("--- FATAL FETCH ERROR (Worker Logic Error) ---");
            console.error("The worker failed to process the update: " + e.message);
            console.error("-------------------------------------------------");
            return new Response('OK', { status: 200 }); 
        }
    }
};
