const WebSocket = require('ws');
const { performance } = require('perf_hooks');

const totalPackets = 1000;
let startTimeNoNagle, startTimeNagle;
let delaysNoNagle = [];
let delaysNagle = [];
let lostPacketsNoNagle = 0;
let lostPacketsNagle = 0;
const TIMEOUT = 5000; // Max time to wait for a packet (5 seconds)

const timeoutMapNoNagle = new Map();  // Map to store timeout IDs for Nagle disabled
const timeoutMapNagle = new Map();    // Map to store timeout IDs for Nagle enabled

// Helper function to calculate statistics
function calculateStats(delays) {
  const total = delays.reduce((a, b) => a + b, 0);
  const avg = total / delays.length || 0;
  const max = Math.max(...delays);
  const min = Math.min(...delays);
  return { avg, max, min };
}

// Helper function to print results in a table
function printResults() {
  const noNagleStats = calculateStats(delaysNoNagle);
  const nagleStats = calculateStats(delaysNagle);

  console.table([
    {
      Scenario: 'Nagle Disabled',
      'Avg Delay (ms)': noNagleStats.avg.toFixed(2),
      'Max Delay (ms)': noNagleStats.max.toFixed(2),
      'Min Delay (ms)': noNagleStats.min.toFixed(2),
      'Packet Loss (%)': ((lostPacketsNoNagle / totalPackets) * 100).toFixed(2)
    },
    {
      Scenario: 'Nagle Enabled',
      'Avg Delay (ms)': nagleStats.avg.toFixed(2),
      'Max Delay (ms)': nagleStats.max.toFixed(2),
      'Min Delay (ms)': nagleStats.min.toFixed(2),
      'Packet Loss (%)': ((lostPacketsNagle / totalPackets) * 100).toFixed(2)
    }
  ]);
}

// Create WebSocket server with Nagle disabled
const serverNoNagle = new WebSocket.Server({ port: 8081 }, () => {
  console.log("Server with Nagle disabled listening on port 8081");
});

serverNoNagle.on('connection', (ws) => {
  if (ws._socket) {
    ws._socket.setNoDelay(true); // Disable Nagle
  }

  ws.on('message', (data) => {
    const packetData = JSON.parse(data);
    const receiveTime = performance.now();
    const delay = receiveTime - packetData.sendTime;
    delaysNoNagle.push(delay);

    // Mark packet as received (for packet loss tracking)
    clearTimeout(timeoutMapNoNagle.get(packetData.id));
    timeoutMapNoNagle.delete(packetData.id);
  });
});

// Create WebSocket server with Nagle enabled
const serverNagle = new WebSocket.Server({ port: 8082 }, () => {
  console.log("Server with Nagle enabled listening on port 8082");
});

serverNagle.on('connection', (ws) => {
  ws.on('message', (data) => {
    const packetData = JSON.parse(data);
    const receiveTime = performance.now();
    const delay = receiveTime - packetData.sendTime;
    delaysNagle.push(delay);

    // Mark packet as received (for packet loss tracking)
    clearTimeout(timeoutMapNagle.get(packetData.id));
    timeoutMapNagle.delete(packetData.id);
  });
});

// Function to run benchmark for both servers
function runBenchmark() {
  const clientNoNagle = new WebSocket('ws://localhost:8081');
  const clientNagle = new WebSocket('ws://localhost:8082');

  startTimeNoNagle = performance.now();
  startTimeNagle = performance.now();

  // Send packets to the server with Nagle disabled
  clientNoNagle.on('open', () => {
    for (let i = 0; i < totalPackets; i++) {
      const sendTime = performance.now();
      const packet = { id: i, sendTime };

      // Set a timeout for this packet
      const timeoutId = setTimeout(() => {
        lostPacketsNoNagle++;
      }, TIMEOUT);

      timeoutMapNoNagle.set(i, timeoutId);  // Store the timeout ID separately
      clientNoNagle.send(JSON.stringify(packet));
    }
  });

  // Send packets to the server with Nagle enabled
  clientNagle.on('open', () => {
    for (let i = 0; i < totalPackets; i++) {
      const sendTime = performance.now();
      const packet = { id: i, sendTime };

      // Set a timeout for this packet
      const timeoutId = setTimeout(() => {
        lostPacketsNagle++;
      }, TIMEOUT);

      timeoutMapNagle.set(i, timeoutId);  // Store the timeout ID separately
      clientNagle.send(JSON.stringify(packet));
    }
  });

  // Wait for all packets to be processed, then print the results
  setTimeout(printResults, TIMEOUT + 1000);
}

// Wait for servers to be ready, then run the benchmark
setTimeout(runBenchmark, 1000);
