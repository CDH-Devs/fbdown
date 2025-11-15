import { Telegraf } from 'telegraf';
import axios from 'axios';
import * as cheerio from 'cheerio'; 

// ⚠️ ඔබ විසින් ලබා දුන් Token එක (Hardcoded)
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const CHATIVE_URL = 'https://chative.io/tools/facebook-video-downloader/';

let bot;

// --- 1. Scraping Logic: Chative.io වෙතින් Direct File Link එක සොයා ගැනීම ---
async function getFileLink(facebookUrl) {
    // Chative.io වෙබ් අඩවිය POST Request එකක් අපේක්ෂා කළ හැක
    const payload = new URLSearchParams();
    payload.append('url', facebookUrl);
    payload.append('submit', 'true'); // මෙය වැදගත් විය හැක
    
    try {
        // Chative.io වෙත POST request එක යවමු
        const response = await axios.post(CHATIVE_URL, payload, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': CHATIVE_URL,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            maxRedirects: 5 
        });
        
        const $ = cheerio.load(response.data);

        // 🎯 නවතම Selector Logic: Download බොත්තම් සොයා ගැනීමට
        // image_312afd.jpg තිර රූ අනුව, Download බොත්තම් සොයමු
        let downloadButtons = $('a:contains("Download")'); 
        let downloadLink = null;

        if (downloadButtons.length > 0) {
            
            // 1. HD Quality Link එක සොයමු
            let hdLink = downloadButtons.filter(function() {
                // HD Quality යන වචනයට ආසන්න text එකක් සොයමු
                return $(this).closest('.card-body').text().includes('HD Quality');
            }).attr('href');

            if (hdLink) downloadLink = hdLink;

            // 2. HD නැත්නම් SD Quality Link එක සොයමු
            if (!downloadLink) {
                let sdLink = downloadButtons.filter(function() {
                    return $(this).closest('.card-body').text().includes('SD Quality');
                }).attr('href');
                if (sdLink) downloadLink = sdLink;
            }
            
            if (downloadLink && downloadLink.startsWith('http')) return downloadLink;
        }

        return null; 
        
    } catch (error) {
        console.error("Chative Scraping Error:", error.message);
        return null; 
    }
}

// --- 2. Download Logic: Buffer එකක් ලෙස ලබා ගැනීම (400 Bad Request මඟහැරීමට) ---
// (පෙර කේතයම මෙහි භාවිතා කරයි)
async function downloadVideoBuffer(downloadUrl) {
    try {
        const response = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            },
            timeout: 60000 
        });
        
        return response.data; 
    } catch (error) {
        console.error("Buffer Download Error:", error.message);
        return null;
    }
}


// --- 3. Telegram Handlers ---
function setupBotHandlers(botInstance) {
    // ... (Handlers පෙර කේතයේ පරිදිම)
    botInstance.start((ctx) => {
        ctx.reply(`👋 හායි ${ctx.from.first_name}! කරුණාකර Facebook වීඩියෝ ලින්ක් එකක් (URL) මට එවන්න.`);
    });
    
    botInstance.on('text', async (ctx) => {
        const url = ctx.message.text.trim();
        const messageId = ctx.message.message_id;

        if (url.startsWith('http')) {
            let loadingMsg;
            try {
                loadingMsg = await ctx.reply('⌛️ වීඩියෝ ලින්ක් එක සකසමින්...', { reply_to_message_id: messageId });
                
                const fileLink = await getFileLink(url); // Chative.io වෙත යයි
                let videoBuffer = null;

                if (fileLink) {
                    await ctx.editMessageText('📥 වීඩියෝව බාගත කරමින්... (Worker එකට විනාඩියක් පමණ ගත විය හැකිය)', { 
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id 
                    });
                    
                    videoBuffer = await downloadVideoBuffer(fileLink);
                }

                if (videoBuffer) {
                    await ctx.deleteMessage(loadingMsg.message_id).catch(e => console.log("Can't delete msg:", e.message));

                    await ctx.replyWithVideo({ source: videoBuffer, filename: 'facebook_video.mp4' }, { 
                        caption: `ඔබ ඉල්ලූ වීඩියෝව මෙන්න.`,
                        reply_to_message_id: messageId 
                    });
                    
                } else {
                    await ctx.editMessageText('⚠️ වීඩියෝව සොයා ගැනීමට හෝ බාගත කිරීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න (Public වීඩියෝ පමණක් වැඩ කරයි).', {
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id
                    });
                }

            } catch (error) {
                console.error("Handler Error:", error.message);
                
                try {
                    if (loadingMsg) {
                         await ctx.editMessageText('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය. (අභ්‍යන්තර දෝෂය).', {
                            chat_id: loadingMsg.chat.id,
                            message_id: loadingMsg.message_id
                        });
                    } else {
                         await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
                    }
                } catch (editError) {
                     await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
                }
            }
        } else {
            ctx.reply('කරුණාකර වලංගු Facebook වීඩියෝ ලින්ක් එකක් (URL) පමණක් එවන්න.');
        }
    });
}

// --- 4. Cloudflare Worker Entry Point ---
export default {
    async fetch(request, env, ctx) {
        
        if (!bot) {
            bot = new Telegraf(BOT_TOKEN);
            setupBotHandlers(bot);
        }
        
        if (request.method === 'POST') {
            try {
                let body;
                try {
                    // JSON Parsing Error හසුරුවයි
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
