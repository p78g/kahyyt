// gimkit_flooder.js
import fetch from 'node-fetch';
import WebSocket from 'ws';
import readline from 'readline';

// ─── Helper for terminal input ──────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// ─── Gimkit API endpoints ──────────────────────────────────────────────────
const api = {
  findRoom: 'https://www.gimkit.com/api/matchmaker/find-info-from-code',
  join: 'https://www.gimkit.com/api/matchmaker/join',
};

// ─── Exact client type string from original script (contains zero‑width chars) ───
const CLIENT_TYPE = `Gimkit ⁡‍⁤‍⁡‌‍⁢‍⁢‍⁡‌‍⁢⁡⁤‍‍‍⁡⁢‍⁢⁡‍‌‍‌‍⁡⁡⁡‍‍‌⁢⁡⁢⁡⁡⁡‍⁣‌‍‌⁡⁤‍‌‍⁡⁤⁡⁢⁡⁢⁡‍⁢‍‍⁢⁣⁡‌⁢‍⁣‌⁡‍⁣⁡‌⁡⁡⁢‍‌⁤⁢‍‌⁢⁡‍⁡⁡‍⁢‍⁢‌⁡⁢⁣⁡‌⁡⁤‍⁡⁡‌‍⁢⁣⁢⁡‍⁡⁣‍‍⁢⁡⁡‍‍⁡‌⁤⁡‌⁢⁡⁢‍⁡‌‍⁢‌⁢⁡‍‌⁢⁡⁢‌⁡‌⁢‍‍‍⁡⁣⁢‍‌‍⁡‍‌⁢‌⁢⁡⁡‌⁢⁣‌⁤⁢⁡‍‍⁡‍⁢⁡⁢⁡⁣⁡‌⁡‍⁡⁡⁣‍⁤⁢⁡⁢‍⁡⁤‌⁡⁤‌⁡⁡‍‍‍‍‍‌⁢⁡⁡‍‍⁢‌‍‌‍⁢‍⁢⁡⁡⁢⁡‌⁡‌⁡⁡‌‍⁡⁢‍‌⁡⁢‌‍⁣‍‌⁤⁡⁡‍⁡‍⁢‍⁣‍⁣⁤‌‍‍⁣⁡‌‍‌⁡⁢⁡⁤‍⁤⁡⁢⁡‌‍⁡⁢‍‍‍‌‍‍‌⁢‍⁢‍⁢‌⁡‍‌⁡‌⁤‍⁡Web Client V3.1`;

// ─── Keep track of active WebSocket connections to close on exit ──────────
const activeSockets = [];

function closeAllSockets() {
  console.log('Closing all WebSocket connections...');
  for (const socket of activeSockets) {
    if (socket.readyState === WebSocket.OPEN) socket.close();
  }
}

// ─── Gimkit API calls ──────────────────────────────────────────────────────
async function findRoom(code) {
  const response = await fetch(api.findRoom, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: String(code) }),
  });
  return response.json();
}

async function getIntent(roomId, name) {
  const response = await fetch(api.join, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId,
      name,
      clientType: CLIENT_TYPE,
    }),
  });
  return response.json();
}

// ─── Join a single bot ─────────────────────────────────────────────────────
async function joinBot(roomInfo, botName) {
  // Step 1: Get intent
  const intent = await getIntent(roomInfo.roomId, botName);

  // Step 2: Get session details
  const sessionUrl = `${intent.serverUrl}/matchmake/joinById/${intent.roomId}`;
  const sessionRes = await fetch(sessionUrl, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentId: intent.intentId }),
  });
  const session = await sessionRes.json();

  // Step 3: Open WebSocket connection
  const wss = intent.serverUrl.replace('https', 'wss');
  const wsUrl = `${wss}/${session.room.processId}/${session.room.roomId}?sessionId=${session.sessionId}`;
  const socket = new WebSocket(wsUrl);
  activeSockets.push(socket);

  return new Promise((resolve, reject) => {
    socket.on('open', () => {
      console.log(`✅ ${botName} joined successfully.`);
      resolve();
    });
    socket.on('error', (err) => {
      console.error(`❌ ${botName} WebSocket error:`, err.message);
      reject(err);
    });
    // Keep the connection open; we don't need to do anything else.
  });
}

// ─── Main program ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Gimkit Flooder (Terminal Version) ===');

  const pin = await question('Enter game PIN: ');
  const countStr = await question('Enter number of bots: ');
  const prefix = await question('Enter name prefix (e.g., bot_): ');

  const botCount = parseInt(countStr, 10);
  if (isNaN(botCount) || botCount <= 0) {
    console.log('Invalid bot count. Exiting.');
    process.exit(1);
  }

  console.log(`\n🔍 Looking up room for PIN ${pin}...`);
  const roomInfo = await findRoom(pin);
  if (roomInfo.code === 404) {
    console.log('❌ Room not found!');
    process.exit(1);
  }
  console.log(`✅ Room found: ${roomInfo.roomId}\n`);

  console.log(`🚀 Launching ${botCount} bots with prefix "${prefix}"...\n`);
  for (let i = 0; i < botCount; i++) {
    const botName = `${prefix}${i}`;
    try {
      await joinBot(roomInfo, botName);
    } catch (err) {
      console.error(`Failed to join ${botName}:`, err.message);
    }
    // Add a small delay between joins to avoid rate‑limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('\n✨ All bots have been processed.');
  console.log('Press Ctrl+C to disconnect all bots and exit.\n');

  // Keep the process alive (so WebSocket connections stay open)
  process.stdin.resume();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Interrupt received. Cleaning up...');
    closeAllSockets();
    setTimeout(() => process.exit(0), 500);
  });
}

main().catch(console.error);
