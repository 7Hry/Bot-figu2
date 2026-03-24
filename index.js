const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const http = require('http');

const PHONE_NUMBER = "5562981573734";   // ← Seu número com 55 + DDD + número

// Servidor fake para o Render
http.createServer((req, res) => res.end('Bot rodando')).listen(process.env.PORT || 10000);

async function conectar() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Bot Figurinhas Dedão', 'Chrome', '1.0'],
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 120000,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Tenta gerar o código de pareamento quando estiver pronto
        if (qr || connection === 'connecting') {
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log('\n🔑 CÓDIGO DE PAREAMENTO GERADO:');
                console.log(code);
                console.log('\nFaça isso no celular:');
                console.log('1. Abra o WhatsApp Business');
                console.log('2. Configurações → Dispositivos vinculados');
                console.log('3. Toque em "Conectar com número de telefone"');
                console.log('4. Digite o código acima (ex: AB12-CD34)');
            } catch (err) {
                console.log('Ainda não conseguiu gerar o código. Tentando novamente...');
            }
        }

        if (connection === 'open') {
            console.log('\n✅ BOT CONECTADO COM SUCESSO VIA CÓDIGO!');
        }

        if (connection === 'close') {
            console.log('Conexão fechada. Reconectando em 10 segundos...');
            setTimeout(conectar, 10000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase().trim();

        const hasMedia = msg.message.imageMessage || msg.message.videoMessage ||
                        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
                        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

        if (!hasMedia && texto !== '/s' && texto !== '/s2') return;

        const isAchatado = texto === '/s' || texto.startsWith('/s ');

        console.log(`📸 Modo: ${isAchatado ? 'ACHATADO' : 'NORMAL'}`);

        try {
            const buffer = await sock.downloadMediaMessage(msg);

            let finalBuffer = buffer;

            if (isAchatado) {
                finalBuffer = await sharp(buffer).resize(512, 512, { fit: 'fill' }).webp({ quality: 70 }).toBuffer();
            } else {
                finalBuffer = await sharp(buffer).resize(512, 512, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
            }

            const sticker = new Sticker(finalBuffer, {
                pack: 'Bot do',
                author: 'Dedão',
                type: StickerTypes.FULL,
                quality: 75,
            });

            const stickerBuffer = await sticker.toBuffer();

            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });

        } catch (err) {
            console.error(err);
            await sock.sendMessage(from, { text: '❌ Erro ao criar sticker.' });
        }
    });
}

conectar();
