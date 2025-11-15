import { Telegraf } from 'telegraf';
// fb-downloader-scrapper පුස්තකාලය Cloudflare Worker පරිසරයට අනුකූල විය යුතුය
import { getFbVideoInfo } from 'fb-downloader-scrapper'; 

// ⚠️ ඔබ ඉල්ලූ Token එක Hardcoded කර ඇත (Hardcoded Token as requested)
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8';

let bot;

// --- 1. Core Logic: fb-downloader-scrapper භාවිතයෙන් Link ලබා ගැනීම ---

async function getFbVideoLinks(videoUrl) {
    try {
        const result = await getFbVideoInfo(videoUrl);
        
        if (result && (result.hd || result.sd)) {
            return { 
                hd: result.hd, 
                sd: result.sd,
                // Telegram වෙත Link යවන නිසා Buffer/Upload Logic අවශ්‍ය නැත.
            };
        }
        
        return { error: "No video links found" };

    } catch (error) {
        console.error("Facebook video fetch error:", error.message);
        return { error: error.message };
    }
}

// --- 2. Telegram Handlers ---

function setupBotHandlers(botInstance) {
    
    botInstance.start((ctx) => {
        ctx.reply("👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.", { parse_mode: 'Markdown' });
    });

    botInstance.help((ctx) => {
        ctx.reply("👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.", { parse_mode: 'Markdown' });
    });

    botInstance.on('text', async (ctx) => {
        const text = ctx.message.text.trim();
        const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.|fb\.)?facebook\.com\/\S+|https?:\/\/fb\.watch\/\S+/i);
        
        if (fbUrlMatch) {
            const fbUrl = fbUrlMatch[0];
            
            let loadingMsg = await ctx.reply("⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
            
            const result = await getFbVideoLinks(fbUrl);

            if (result.error) {
                await ctx.editMessageText(`❌ දෝෂය: ${result.error}\n\n💡 කරුණාකර පරීක්ෂා කරන්න:\n- වීඩියෝ URL නිවැරදි දැයි\n- වීඩියෝව ප්‍රසිද්ධ (public) දැයි\n- වීඩියෝව තවමත් ලබා ගත හැකි දැයි`, {
                    chat_id: loadingMsg.chat.id,
                    message_id: loadingMsg.message_id
                });

            } else if (result.hd) {
                // HD එක යැවීමට උත්සාහ කරන්න
                try {
                    await ctx.deleteMessage(loadingMsg.message_id);
                    await ctx.replyWithVideo(result.hd, { 
                        caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (HD)' 
                    });
                } catch (error) {
                    console.error("Error sending HD video:", error.message);
                    // HD යැවීමට බැරිනම් SD යවන්න
                    if (result.sd) {
                        try {
                            await ctx.replyWithVideo(result.sd, { 
                                caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)\n⚠️ HD ප්‍රමාණය ඉතා විශාල නිසා SD යැවීය.' 
                            });
                        } catch (sdError) {
                            console.error("Error sending SD video fallback:", sdError.message);
                            await ctx.reply("❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link (SD):\n" + result.sd);
                        }
                    } else {
                        await ctx.reply("❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
                    }
                }
            } else if (result.sd) {
                // HD නැත්නම් SD පමණක් යවන්න
                try {
                    await ctx.deleteMessage(loadingMsg.message_id);
                    await ctx.replyWithVideo(result.sd, { caption: '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)' });
                } catch (error) {
                    console.error("Error sending SD video:", error.message);
                    await ctx.reply("❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link (SD):\n" + result.sd);
                }
            } else {
                await ctx.editMessageText("❌ වීඩියෝ සබැඳිය ලබා ගැනීමට නොහැකි විය. සබැඳිය නිවැරදි දැයි පරීක්ෂා කරන්න.", {
                    chat_id: loadingMsg.chat.id,
                    message_id: loadingMsg.message_id
                });
            }
        } else {
            await ctx.reply("💡 කරුණාකර වලංගු Facebook වීඩියෝ සබැඳියක් පමණක් එවන්න.");
        }
    });
}


// --- 3. Cloudflare Worker Entry Point (Webhook Logic) ---
export default {
    async fetch(request, env, ctx) {
        // Hardcoded BOT_TOKEN එක භාවිතා කරයි
        if (!BOT_TOKEN) {
             return new Response('Error: BOT_TOKEN is missing from the code.', { status: 500 });
        }
        
        if (!bot) {
            bot = new Telegraf(BOT_TOKEN); // Hardcoded Token භාවිතා කරයි
            setupBotHandlers(bot);
        }
        
        // Telegram වෙතින් එන POST request එක හසුරුවයි (Webhook)
        if (request.method === 'POST') {
            try {
                let body;
                try {
                    // JSON Parsing Error (Unexpected end of JSON input) හසුරුවයි
                    body = await request.json(); 
                } catch (e) {
                    console.error('JSON Parsing Error (Ignoring request):', e.message);
                    return new Response('OK - JSON Error Handled', { status: 200 }); 
                }

                await bot.handleUpdate(body);
                return new Response('OK', { status: 200 });

            } catch (error) {
                console.error('Webhook Handling Error:', error.message);
                return new Response('Error handling update', { status: 500 });
            }
        }

        return new Response('Facebook Downloader Bot Worker is running.', { status: 200 });
    },
};
