import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

async function runRepro() {
  console.log("Starting reproduction script...");

  const client1 = io(SERVER_URL);
  
  await new Promise((resolve) => client1.on("connect", resolve));
  console.log("Client connected");

  // Create room
  client1.emit("room:create", { playerName: "Tester" });
  const roomState = await new Promise((resolve) => client1.once("room:state", resolve));
  const roomCode = roomState.code;
  console.log(`Room created: ${roomCode}`);

  // Start match
  client1.emit("room:start", { code: roomCode });
  const matchStarted = await new Promise((resolve) => client1.once("match:started", resolve));
  const initialPlayers = await new Promise((resolve) => client1.once("state:players", resolve));
  const myPlayer = initialPlayers.find(p => p.id === client1.id);
  const startX = myPlayer.x;
  console.log(`Match started. Initial X: ${startX}`);

  // Test 1: Send 10 packets over 500ms
  console.log("Test 1: 10 packets over 500ms");
  for (let i = 0; i < 10; i++) {
    client1.emit("player:input:move", { direction: { x: 1, y: 0 } });
    await new Promise(r => setTimeout(r, 50));
  }
  
  // Wait a bit for server to process
  await new Promise(r => setTimeout(r, 100));
  const players1 = await new Promise((resolve) => client1.once("state:players", resolve));
  const p1 = players1.find(p => p.id === client1.id);
  const dist1 = p1.x - startX;
  console.log(`Distance 1 (10 packets): ${dist1}`);

  // Reset position (just rejoin or whatever, but easier to just calculate delta)
  const startX2 = p1.x;

  // Test 2: Send 50 packets over 500ms (turning simulation)
  console.log("Test 2: 50 packets over 500ms");
  for (let i = 0; i < 50; i++) {
    // We send slightly different directions to simulate turning if needed, 
    // but even the same direction should cause acceleration if it's per-packet.
    client1.emit("player:input:move", { direction: { x: 1, y: 0 } });
    await new Promise(r => setTimeout(r, 10));
  }

  await new Promise(r => setTimeout(r, 100));
  const players2 = await new Promise((resolve) => client1.once("state:players", resolve));
  const p2 = players2.find(p => p.id === client1.id);
  const dist2 = p2.x - startX2;
  console.log(`Distance 2 (50 packets): ${dist2}`);

  console.log(`Ratio (Dist2 / Dist1): ${dist2 / dist1}`);
  
  if (dist2 > dist1 * 1.5) {
    console.log("FAILURE: Movement acceleration detected!");
  } else {
    console.log("SUCCESS: Movement is consistent.");
  }

  client1.disconnect();
}

runRepro().catch(console.error);
