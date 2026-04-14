const http = require('http');

const args = process.argv.slice(2);
const options = {
  type: 'CPU_INTENSIVE',
  priority: 'NORMAL',
  count: 1,
  timeout: 10000
};

// Simple arg parser
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type') options.type = args[++i];
  if (args[i] === '--priority') options.priority = args[++i].toUpperCase();
  if (args[i] === '--count') options.count = parseInt(args[++i], 10);
  if (args[i] === '--timeout') options.timeout = parseInt(args[++i], 10);
  if (args[i] === '--help') {
    console.log(`
Usage: node submit.js [options]

Options:
  --type      Task type (CPU_INTENSIVE or IO_TASK)
  --priority  Task priority (URGENT, HIGH, NORMAL)
  --count     Number of tasks to submit
  --timeout   Timeout in ms
    `);
    process.exit(0);
  }
}

const reqData = JSON.stringify(options);

const reqOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/tasks',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': reqData.length
  }
};

const req = http.request(reqOptions, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 202) {
      console.log(`🔥 Successfully submitted ${options.count} x [${options.priority}] ${options.type} task(s).`);
    } else {
      console.error(`Failed: ${res.statusCode} - ${body}`);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem connecting to scheduler: ${e.message}`);
});

req.write(reqData);
req.end();
